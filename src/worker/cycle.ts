import pLimit from "p-limit";
import type { PrismaClient } from "@prisma/client";
import { pollPrinterInkLevels } from "../lib/snmp/client";
import { decideReorderQty } from "../lib/consumption/quantity-rule";
import { getSetting } from "../lib/settings";
import { getEmailSender } from "../lib/email";
import type { ColorSlotKey } from "../lib/excel/mapping";

const POLL_CONCURRENCY = 4;

export interface CycleSummary {
  pollCycleId: number;
  printersPolled: number;
  printersFailed: number;
  reorderEventsCreated: number;
}

/** Un ciclo completo de sondeo SNMP + reglas de pedido + avisos por email. */
export async function runPollCycle(prisma: PrismaClient): Promise<CycleSummary> {
  const startedAt = new Date();
  const pollCycle = await prisma.pollCycle.create({
    data: { startedAt, status: "SUCCESS" },
  });

  const printers = await prisma.printer.findMany({ where: { isActive: true } });
  const reorderThreshold = await getSetting(prisma, "reorderThresholdPercent");
  const emailAlertThreshold = await getSetting(prisma, "emailAlertThresholdPercent");
  const reorderXlAndNormal = await getSetting(prisma, "reorderXlAndNormal");

  const limit = pLimit(POLL_CONCURRENCY);
  let printersFailed = 0;
  const newReorderEventIds: number[] = [];
  const newAlerts: { printerId: number; colorSlot: ColorSlotKey; levelPercent: number | null; alertText: string | null }[] =
    [];

  await Promise.allSettled(
    printers.map((printer) =>
      limit(async () => {
        const t0 = Date.now();
        if (!printer.ip) {
          await prisma.pollCyclePrinterResult.create({
            data: {
              pollCycleId: pollCycle.id,
              printerId: printer.id,
              success: false,
              errorMessage: "Sin IP configurada",
              durationMs: Date.now() - t0,
              readingsCount: 0,
            },
          });
          printersFailed++;
          return;
        }

        const result = await pollPrinterInkLevels({
          ip: printer.ip,
          community: printer.snmpCommunity,
          version: printer.snmpVersion === "1" ? "1" : "2c",
          port: printer.snmpPort,
        });

        if (!result.ok) {
          printersFailed++;
          await prisma.printer.update({
            where: { id: printer.id },
            data: { lastError: result.error ?? "Error SNMP desconocido" },
          });
          await prisma.pollCyclePrinterResult.create({
            data: {
              pollCycleId: pollCycle.id,
              printerId: printer.id,
              success: false,
              errorMessage: result.error,
              durationMs: Date.now() - t0,
              readingsCount: 0,
            },
          });
          return;
        }

        await prisma.printer.update({
          where: { id: printer.id },
          data: { lastError: null, lastSeenAt: new Date() },
        });

        for (const reading of result.readings) {
          await prisma.inkLevelReading.create({
            data: {
              printerId: printer.id,
              colorSlot: reading.colorSlot,
              levelPercent: reading.levelPercent,
              rawValue: reading.rawValue,
              capacityRaw: reading.capacityRaw,
              criticalAlert: reading.criticalAlert,
              alertText: reading.alertText,
              readAt: new Date(),
              pollCycleId: pollCycle.id,
            },
          });
        }

        await prisma.pollCyclePrinterResult.create({
          data: {
            pollCycleId: pollCycle.id,
            printerId: printer.id,
            success: true,
            durationMs: Date.now() - t0,
            readingsCount: result.readings.length,
          },
        });

        for (const reading of result.readings) {
          // Dos formas de estar "bajo": el % mide por debajo del umbral, o
          // (para impresoras que nunca dan %, ver criticalAlert) la propia
          // impresora avisa por texto de que el consumible está bajo/agotado.
          const belowReorderThreshold =
            (reading.levelPercent !== null && reading.levelPercent < reorderThreshold) || reading.criticalAlert;
          const belowEmailThreshold =
            (reading.levelPercent !== null && reading.levelPercent < emailAlertThreshold) || reading.criticalAlert;

          if (!belowReorderThreshold && !belowEmailThreshold) continue;

          if (belowReorderThreshold) {
            const eventId = await maybeTriggerReorder(
              prisma,
              printer.id,
              reading.colorSlot,
              reorderXlAndNormal,
              pollCycle.id,
            );
            if (eventId) newReorderEventIds.push(eventId);
          }

          const shouldAlert = await updateEmailAlertState(prisma, printer.id, reading.colorSlot, belowEmailThreshold);
          if (shouldAlert) {
            newAlerts.push({
              printerId: printer.id,
              colorSlot: reading.colorSlot,
              levelPercent: reading.levelPercent,
              alertText: reading.alertText,
            });
          }
        }
      }),
    ),
  );

  await prisma.pollCycle.update({
    where: { id: pollCycle.id },
    data: {
      finishedAt: new Date(),
      status: printersFailed === 0 ? "SUCCESS" : printersFailed === printers.length ? "FAILED" : "PARTIAL",
      printersPolled: printers.length,
      printersFailed,
    },
  });

  if (newReorderEventIds.length > 0) {
    await sendReorderDigestEmail(prisma, newReorderEventIds);
  }
  if (newAlerts.length > 0) {
    await sendLowInkAlertEmail(prisma, newAlerts);
  }

  return {
    pollCycleId: pollCycle.id,
    printersPolled: printers.length,
    printersFailed,
    reorderEventsCreated: newReorderEventIds.length,
  };
}

/**
 * Si el color está por debajo del umbral y hay al menos una celda STOCK
 * elegible (BLANK, no enmascarada) para ese color en esa impresora, calcula
 * la cantidad y la escribe en BD (todavía no en el Excel — eso lo hace el
 * ciclo de sincronización aparte). Si ya hay un pedido pendiente (NUMBER) no
 * se toca nada (idempotencia). Cuando existen fila normal y fila XL para ese
 * color, se pide en ambas (ver Riesgos del plan).
 */
async function maybeTriggerReorder(
  prisma: PrismaClient,
  printerId: number,
  colorSlot: ColorSlotKey,
  reorderXlAndNormal: boolean,
  pollCycleId: number,
): Promise<number | null> {
  const cartridgeRows = await prisma.printerCartridgeRow.findMany({
    where: { printerId },
    include: { stockCells: { where: { colorSlot } } },
  });

  const candidateCells = cartridgeRows
    .flatMap((row) => row.stockCells.map((cell) => ({ cell, row })))
    .filter(({ cell }) => cell.cellType !== "X");

  if (candidateCells.length === 0) return null; // color no aplica a esta impresora

  const eligible = candidateCells.filter(({ cell }) => cell.cellType === "BLANK");
  if (eligible.length === 0) return null; // ya hay algo pendiente en todas las filas relevantes

  const targets = reorderXlAndNormal ? eligible : [eligible[0]];

  const decision = await decideReorderQty(prisma, printerId, colorSlot);

  for (const { cell } of targets) {
    await prisma.stockCell.update({
      where: { id: cell.id },
      data: { cellType: "NUMBER", pendingQty: decision.qty, updatedByUserId: null },
    });
  }

  const event = await prisma.reorderEvent.create({
    data: {
      printerId,
      colorSlot,
      qty: decision.qty,
      reason: "THRESHOLD",
      cartridgeRowIds: JSON.stringify(targets.map(({ row }) => row.id)),
      ruleInputsJson: JSON.stringify(decision.ruleInputs),
      pollCycleId,
    },
  });

  return event.id;
}

/**
 * Umbral de aviso por email, independiente del umbral de "pedir". Solo avisa
 * una vez por "episodio" (al cruzar hacia abajo), no en cada ciclo mientras
 * siga bajo, y se rearma solo cuando el nivel vuelve a subir por encima.
 */
async function updateEmailAlertState(
  prisma: PrismaClient,
  printerId: number,
  colorSlot: ColorSlotKey,
  isBelow: boolean,
): Promise<boolean> {
  const state = await prisma.emailAlertState.upsert({
    where: { printerId_colorSlot: { printerId, colorSlot } },
    update: {},
    create: { printerId, colorSlot, currentlyBelow: false },
  });

  if (isBelow && !state.currentlyBelow) {
    await prisma.emailAlertState.update({
      where: { id: state.id },
      data: { currentlyBelow: true, lastAlertedAt: new Date() },
    });
    return true;
  }

  if (!isBelow && state.currentlyBelow) {
    await prisma.emailAlertState.update({
      where: { id: state.id },
      data: { currentlyBelow: false },
    });
  }

  return false;
}

async function sendReorderDigestEmail(prisma: PrismaClient, eventIds: number[]): Promise<void> {
  const events = await prisma.reorderEvent.findMany({
    where: { id: { in: eventIds } },
    include: { printer: { include: { department: true } } },
  });
  if (events.length === 0) return;

  const emailTo = await getSetting(prisma, "emailTo");
  const sender = await getEmailSender(prisma);

  const rows = events
    .map((e) => {
      const rowIds = JSON.parse(e.cartridgeRowIds) as number[];
      const generations = rowIds.length > 1 ? "1x NORMAL + 1x XL" : "";
      return `<tr><td>${e.printer.department.name}</td><td>${e.printer.name}</td><td>${e.colorSlot}</td><td>${e.qty}</td><td>${generations}</td></tr>`;
    })
    .join("\n");

  const html = `
    <p>Se han detectado ${events.length} pedido(s) de tinta/tóner pendientes:</p>
    <table border="1" cellpadding="4" cellspacing="0">
      <thead><tr><th>Departamento</th><th>Impresora</th><th>Color</th><th>Cantidad</th><th>Nota</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
  `;

  const result = await sender.send({
    to: [emailTo],
    subject: `Tintas Auto: ${events.length} pedido(s) de tinta/tóner detectados`,
    html,
  });

  const now = new Date();
  for (const e of events) {
    await prisma.reorderEvent.update({
      where: { id: e.id },
      data: result.success
        ? { emailSentAt: now }
        : { emailError: result.error ?? "Error desconocido al enviar el email" },
    });
  }
}

async function sendLowInkAlertEmail(
  prisma: PrismaClient,
  alerts: { printerId: number; colorSlot: ColorSlotKey; levelPercent: number | null; alertText: string | null }[],
): Promise<void> {
  const printers = await prisma.printer.findMany({
    where: { id: { in: alerts.map((a) => a.printerId) } },
    include: { department: true },
  });
  const printerById = new Map(printers.map((p) => [p.id, p]));

  const emailTo = await getSetting(prisma, "emailTo");
  const sender = await getEmailSender(prisma);

  const rows = alerts
    .map((a) => {
      const printer = printerById.get(a.printerId);
      const nivel = a.levelPercent !== null ? `${a.levelPercent}%` : (a.alertText ?? "sin % (aviso de la impresora)");
      return `<tr><td>${printer?.department.name ?? a.printerId}</td><td>${printer ? `${printer.brand} ${printer.model}` : ""}</td><td>${a.colorSlot}</td><td>${nivel}</td></tr>`;
    })
    .join("\n");

  const html = `
    <p>Aviso: ${alerts.length} color(es) de tinta/tóner por debajo del umbral de aviso:</p>
    <table border="1" cellpadding="4" cellspacing="0">
      <thead><tr><th>Departamento</th><th>Impresora</th><th>Color</th><th>Nivel</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
  `;

  await sender.send({
    to: [emailTo],
    subject: `Tintas Auto: aviso de nivel bajo (${alerts.length})`,
    html,
  });
}
