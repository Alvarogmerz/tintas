"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "../db";
import { requireUser, requireAdmin } from "../auth/guards";
import { writePrinterIdentityToExcel } from "../excel/writer";
import { pollPrinterInkLevels } from "../snmp/client";

export interface UpdatePrinterResult {
  error?: string;
  warning?: string;
  success?: string;
}

const BRANDS = ["EPSON", "BROTHER", "HP", "OTHER"] as const;

/**
 * Edita la configuración de una impresora (IP, marca, modelo, ajustes SNMP,
 * activa/inactiva). Solo administradores — a diferencia de STOCK/PEDIR, esto
 * es configuración de infraestructura, no trabajo diario de almacén.
 */
export async function updatePrinterAction(_prev: UpdatePrinterResult, formData: FormData): Promise<UpdatePrinterResult> {
  await requireAdmin();

  const printerId = Number(formData.get("printerId"));
  const ip = String(formData.get("ip") ?? "").trim();
  const brand = String(formData.get("brand") ?? "OTHER");
  const model = String(formData.get("model") ?? "").trim();
  const snmpCommunity = String(formData.get("snmpCommunity") ?? "public").trim();
  const snmpVersion = String(formData.get("snmpVersion") ?? "2c");
  const snmpPort = Number(formData.get("snmpPort") ?? 161);
  const isActive = formData.get("isActive") === "on";

  if (ip && !/^(\d{1,3}\.){3}\d{1,3}$/.test(ip)) {
    return { error: "La IP no tiene un formato válido (ej. 10.0.170.99)." };
  }
  if (!BRANDS.includes(brand as (typeof BRANDS)[number])) {
    return { error: "Marca no válida." };
  }
  if (!model) {
    return { error: "El modelo no puede estar vacío." };
  }
  if (!snmpCommunity) {
    return { error: "La comunidad SNMP no puede estar vacía." };
  }
  if (!Number.isInteger(snmpPort) || snmpPort < 1 || snmpPort > 65535) {
    return { error: "El puerto SNMP debe ser un número entre 1 y 65535." };
  }

  await prisma.printer.update({
    where: { id: printerId },
    data: {
      ip: ip || null,
      brand: brand as (typeof BRANDS)[number],
      model,
      snmpCommunity,
      snmpVersion,
      snmpPort,
      isActive,
      lastError: null, // se limpia para no arrastrar un error de la IP antigua
    },
  });

  revalidatePath("/impresoras");
  revalidatePath(`/impresoras/${printerId}`);
  revalidatePath("/");
  revalidatePath("/pedidos");

  const excelPath = process.env.EXCEL_PATH;
  if (!excelPath) return { success: "Guardado en la base de datos (EXCEL_PATH no configurado en este entorno)." };

  const result = await writePrinterIdentityToExcel(prisma, excelPath, printerId);
  if (result.status === "DEFERRED_LOCKED") {
    return { warning: "Guardado. El Excel está abierto ahora mismo — se actualizará allí en cuanto se cierre." };
  }
  if (result.status === "FAILED") {
    return { warning: `Guardado, pero no se pudo escribir en el Excel: ${result.errorMessage ?? "error desconocido"}.` };
  }
  return { success: "Guardado y actualizado en el Excel." };
}

export interface TestConnectionResult {
  ok: boolean;
  error?: string;
  readings?: { colorSlot: string; levelPercent: number | null; criticalAlert: boolean }[];
  unclassified?: string[];
}

/**
 * Prueba de conexión al momento (no espera al ciclo de 5 minutos): sondea
 * esta impresora ahora mismo por SNMP y guarda el resultado (última vez
 * vista / error, y las lecturas, para que se vea también en el resto del
 * panel) — pero sin disparar pedidos ni emails, que es cosa del ciclo normal.
 */
export async function testPrinterConnectionAction(printerId: number): Promise<TestConnectionResult> {
  await requireUser();

  const printer = await prisma.printer.findUnique({ where: { id: printerId } });
  if (!printer) return { ok: false, error: "Impresora no encontrada." };
  if (!printer.ip) return { ok: false, error: "Esta impresora no tiene IP configurada." };

  const result = await pollPrinterInkLevels({
    ip: printer.ip,
    community: printer.snmpCommunity,
    version: printer.snmpVersion === "1" ? "1" : "2c",
    port: printer.snmpPort,
  });

  if (!result.ok) {
    await prisma.printer.update({ where: { id: printerId }, data: { lastError: result.error ?? "Error SNMP desconocido" } });
    revalidatePath(`/impresoras/${printerId}`);
    revalidatePath("/impresoras");
    return { ok: false, error: result.error };
  }

  await prisma.printer.update({ where: { id: printerId }, data: { lastError: null, lastSeenAt: new Date() } });
  for (const reading of result.readings) {
    await prisma.inkLevelReading.create({
      data: {
        printerId,
        colorSlot: reading.colorSlot,
        levelPercent: reading.levelPercent,
        rawValue: reading.rawValue,
        capacityRaw: reading.capacityRaw,
        criticalAlert: reading.criticalAlert,
        alertText: reading.alertText,
      },
    });
  }

  revalidatePath(`/impresoras/${printerId}`);
  revalidatePath("/impresoras");
  revalidatePath("/");

  return {
    ok: true,
    readings: result.readings.map((r) => ({ colorSlot: r.colorSlot, levelPercent: r.levelPercent, criticalAlert: r.criticalAlert })),
    unclassified: result.unclassified,
  };
}
