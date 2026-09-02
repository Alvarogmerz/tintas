import * as snmp from "net-snmp";
import { OID, CAPACITY_UNKNOWN } from "./oids";
import { classifyColorSlot, isCriticalSupplyAlert } from "./classify";
import type { ColorSlotKey } from "../excel/mapping";

export interface SnmpTarget {
  ip: string;
  community: string;
  version: "1" | "2c";
  port: number;
  timeoutMs?: number;
  retries?: number;
}

export interface InkReading {
  colorSlot: ColorSlotKey;
  description: string;
  levelPercent: number | null; // null = no medible (sentinela RFC o capacidad desconocida)
  rawValue: number | null;
  capacityRaw: number | null;
  // Cuando el nivel no es medible (levelPercent null), esta es la única señal
  // que da la impresora de que hace falta pedir: una alerta activa de tóner
  // bajo/agotado por texto (ver classify.ts). Si viene true, se trata igual
  // que un nivel por debajo del umbral a efectos de generar el pedido.
  criticalAlert: boolean;
  alertText: string | null;
}

export interface PollPrinterResult {
  ok: boolean;
  readings: InkReading[];
  unclassified: string[]; // descripciones que no se pudieron mapear a un color
  error?: string;
}

function lastOidArc(oid: string): string {
  const parts = oid.split(".");
  return parts[parts.length - 1];
}

function snmpGetNext(session: snmp.Session, oids: string[]): Promise<snmp.Varbind[]> {
  return new Promise((resolve, reject) => {
    session.getNext(oids, (error: Error | null, varbinds?: snmp.Varbind[]) => {
      if (error) reject(error);
      else resolve(varbinds ?? []);
    });
  });
}

const MAX_WALK_STEPS = 64; // salvaguarda: una tabla de consumibles nunca tiene tantas filas

/**
 * Camina varias columnas de una misma tabla SNMP a la vez (una petición
 * GETNEXT con varios OID por paso, avanzando todas en paralelo) hasta salir
 * del prefijo de cada una.
 *
 * Se usa GETNEXT en vez de GETBULK (que es lo que hacen `session.walk()` /
 * `session.subtree()` de esta librería) porque varias impresoras reales de
 * la flota (Brother, algún modelo HP) no responden en absoluto a GETBULK —
 * se quedan calladas y da timeout — pero sí a GETNEXT, que es la operación
 * más antigua y universalmente soportada de SNMP.
 *
 * Si un paso falla (p.ej. un timeout puntual en un enlace inestable), se
 * corta ahí y se devuelve lo acumulado hasta ese punto: mejor una lectura
 * parcial que ninguna.
 */
async function walkColumns(session: snmp.Session, baseOids: string[]): Promise<Map<string, snmp.Varbind>[]> {
  const columns = baseOids.map((baseOid) => ({
    baseOid,
    current: baseOid,
    done: false,
    results: new Map<string, snmp.Varbind>(),
  }));

  for (let step = 0; step < MAX_WALK_STEPS; step++) {
    const active = columns.filter((c) => !c.done);
    if (active.length === 0) break;

    let varbinds: snmp.Varbind[];
    try {
      varbinds = await snmpGetNext(
        session,
        active.map((c) => c.current),
      );
    } catch {
      break;
    }

    active.forEach((col, i) => {
      const vb = varbinds[i];
      if (!vb || snmp.isVarbindError(vb) || !vb.oid.startsWith(`${col.baseOid}.`)) {
        col.done = true;
        return;
      }
      col.results.set(lastOidArc(vb.oid), vb);
      col.current = vb.oid;
    });
  }

  return columns.map((c) => c.results);
}

function varbindToNumber(vb: snmp.Varbind | undefined): number | null {
  if (!vb) return null;
  const v = vb.value;
  if (typeof v === "number") return v;
  if (Buffer.isBuffer(v)) return Number(v.toString());
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function varbindToText(vb: snmp.Varbind | undefined): string {
  if (!vb) return "";
  const v = vb.value;
  if (Buffer.isBuffer(v)) return v.toString("utf8");
  return String(v ?? "");
}

/**
 * Sondea una impresora vía SNMP (Printer-MIB estándar, RFC 3805) y devuelve
 * los niveles de tinta/tóner ya clasificados por color. Nunca lanza: los
 * fallos de red/SNMP se devuelven como { ok: false, error } para que el
 * llamador pueda seguir con el resto de la flota.
 */
export async function pollPrinterInkLevels(target: SnmpTarget): Promise<PollPrinterResult> {
  const session = snmp.createSession(target.ip, target.community, {
    port: target.port,
    version: target.version === "1" ? snmp.Version1 : snmp.Version2c,
    timeout: target.timeoutMs ?? 5000,
    retries: target.retries ?? 2,
  });

  try {
    const [descriptions, capacities, levels] = await walkColumns(session, [
      OID.SUPPLIES_DESCRIPTION,
      OID.SUPPLIES_MAX_CAPACITY,
      OID.SUPPLIES_LEVEL,
    ]);

    if (descriptions.size === 0 && capacities.size === 0 && levels.size === 0) {
      // `walkColumns` degrada con gracia ante fallos a mitad de camino (para
      // no tirar una lectura parcial válida), pero si no se obtuvo ni un solo
      // valor es que el dispositivo no ha respondido nada: hay que tratarlo
      // como fallo real, no como "0 consumibles".
      return { ok: false, readings: [], unclassified: [], error: "Request timed out" };
    }

    // Tabla de alertas: para impresoras que nunca dan un % de nivel (ver
    // isCriticalSupplyAlert), es la única señal de "hace falta pedir". No se
    // trata como fallo si no responde — simplemente no hay alertas que leer.
    const [alertGroupIndices, alertDescriptions] = await walkColumns(session, [
      OID.ALERT_GROUP_INDEX,
      OID.ALERT_DESCRIPTION,
    ]);
    const criticalSupplyIndex = new Map<string, string>(); // índice de consumible -> texto de la alerta
    for (const [alertRowIndex, groupIndexVb] of alertGroupIndices) {
      const descVb = alertDescriptions.get(alertRowIndex);
      const alertText = varbindToText(descVb);
      if (!alertText || !isCriticalSupplyAlert(alertText)) continue;
      const supplyIndex = varbindToNumber(groupIndexVb);
      if (supplyIndex === null) continue;
      criticalSupplyIndex.set(String(supplyIndex), alertText);
    }

    const readings: InkReading[] = [];
    const unclassified: string[] = [];

    for (const [index, descVb] of descriptions) {
      const description = varbindToText(descVb);
      const colorSlot = classifyColorSlot(description);
      if (!colorSlot) {
        if (description) unclassified.push(description);
        continue;
      }

      const capacityRaw = varbindToNumber(capacities.get(index));
      const rawValue = varbindToNumber(levels.get(index));

      let levelPercent: number | null = null;
      if (
        rawValue !== null &&
        rawValue >= 0 &&
        capacityRaw !== null &&
        capacityRaw !== CAPACITY_UNKNOWN &&
        capacityRaw > 0
      ) {
        levelPercent = Math.round((rawValue / capacityRaw) * 100);
      }

      const alertText = criticalSupplyIndex.get(index) ?? null;
      readings.push({
        colorSlot,
        description,
        levelPercent,
        rawValue,
        capacityRaw,
        criticalAlert: alertText !== null,
        alertText,
      });
    }

    return { ok: true, readings, unclassified };
  } catch (err) {
    return { ok: false, readings: [], unclassified: [], error: (err as Error).message };
  } finally {
    session.close();
  }
}
