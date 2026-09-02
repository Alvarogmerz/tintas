import "dotenv/config";
import { prisma } from "../lib/db";
import { getSetting } from "../lib/settings";
import { runPollCycle } from "./cycle";
import { syncExcelNow } from "../lib/excel/sync";

let stopping = false;

// Vigilante: si un ciclo (sondeo o sincronización) no termina en este tiempo,
// se da por colgado y se cierra el proceso entero en vez de quedarse zombie
// para siempre — mejor que el propio proceso se caiga (y quede claro en los
// logs) a que alguien tenga que ir a buscarlo y matarlo a mano.
const CYCLE_WATCHDOG_MS = 10 * 60 * 1000;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

class CycleTimeoutError extends Error {}

function withWatchdog<T>(promise: Promise<T>, label: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new CycleTimeoutError(`${label} no terminó en ${CYCLE_WATCHDOG_MS / 60000} minutos`));
    }, CYCLE_WATCHDOG_MS);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

/**
 * Espera hasta el siguiente ciclo normal, pero comprueba cada pocos segundos
 * si desde el panel (/ajustes) se ha pedido un "ejecutar ahora" — en ese caso
 * corta la espera antes. `manualRequestKey` guarda la última marca de tiempo
 * ya atendida para no disparar dos veces por la misma petición.
 */
async function waitForNextRunOrManualTrigger(
  intervalSetting: "pollIntervalMs" | "excelSyncIntervalMs",
  manualRequestSetting: "manualPollRequestedAt" | "manualExcelSyncRequestedAt",
  lastHandledRef: { value: string | null },
): Promise<void> {
  const intervalMs = await getSetting(prisma, intervalSetting);
  const deadline = Date.now() + intervalMs;
  const CHECK_EVERY_MS = 5000;

  while (Date.now() < deadline && !stopping) {
    await sleep(Math.min(CHECK_EVERY_MS, Math.max(0, deadline - Date.now())));
    const requestedAt = await getSetting(prisma, manualRequestSetting);
    if (requestedAt && requestedAt !== lastHandledRef.value) {
      lastHandledRef.value = requestedAt;
      return;
    }
  }
}

/** Cierra el proceso entero ante un ciclo colgado — ver CYCLE_WATCHDOG_MS. */
function haltOnHungCycle(label: string): never {
  console.error(`[poller] ${label} se ha quedado colgado más de 10 minutos. Cerrando el proceso.`);
  process.exit(1);
}

async function pollLoop(): Promise<void> {
  const lastHandled = { value: null as string | null };
  while (!stopping) {
    try {
      const summary = await withWatchdog(runPollCycle(prisma), "El ciclo de sondeo");
      console.log(
        `[poller] ciclo ${summary.pollCycleId}: ${summary.printersPolled} sondeadas, ${summary.printersFailed} fallidas, ${summary.reorderEventsCreated} pedido(s) nuevo(s)`,
      );
    } catch (err) {
      if (err instanceof CycleTimeoutError) haltOnHungCycle("el ciclo de sondeo");
      console.error("[poller] error en el ciclo de sondeo:", err);
    }
    await waitForNextRunOrManualTrigger("pollIntervalMs", "manualPollRequestedAt", lastHandled);
  }
}

async function excelSyncLoop(): Promise<void> {
  const lastHandled = { value: null as string | null };
  while (!stopping) {
    try {
      const result = await withWatchdog(syncExcelNow(prisma), "La sincronización con Excel");
      if (result.status !== "NOOP") {
        console.log(`[excel-sync] ${result.status} — ${result.cellsWritten} celda(s) escritas`);
      }
    } catch (err) {
      if (err instanceof CycleTimeoutError) haltOnHungCycle("la sincronización con Excel");
      console.error("[excel-sync] error en la sincronización:", err);
    }
    await waitForNextRunOrManualTrigger("excelSyncIntervalMs", "manualExcelSyncRequestedAt", lastHandled);
  }
}

function shutdown(signal: string) {
  console.log(`[poller] recibido ${signal}, cerrando...`);
  stopping = true;
  prisma.$disconnect().finally(() => process.exit(0));
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));

console.log("[poller] worker iniciado");
Promise.all([pollLoop(), excelSyncLoop()]).catch((err) => {
  console.error("[poller] fallo fatal:", err);
  process.exit(1);
});
