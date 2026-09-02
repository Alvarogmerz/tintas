import type { PrismaClient } from "@prisma/client";
import { syncPendingStockToExcel, type SyncResult } from "./writer";
import { backupExcelFile } from "./backup";

/**
 * Reconcilia BD <-> Excel real y escribe lo pendiente, dejando constancia en
 * ExcelSyncLog. La usan tanto el worker (ciclo periódico) como el panel web
 * (edición manual con guardado inmediato, botón "Guardar", carga de la
 * página de una impresora) — es la misma operación segura e idempotente
 * llamada desde sitios distintos.
 *
 * De paso, si el archivo existe, se hace copia de seguridad (como mucho una
 * por hora — ver backup.ts) para poder restaurarlo si alguien lo borra.
 */
export async function syncExcelNow(prisma: PrismaClient): Promise<SyncResult> {
  const excelPath = process.env.EXCEL_PATH;
  const startedAt = new Date();

  if (!excelPath) {
    const result: SyncResult = {
      status: "FAILED",
      cellsWritten: 0,
      lockDetected: false,
      errorMessage: "EXCEL_PATH no está configurado",
    };
    await prisma.excelSyncLog.create({
      data: {
        startedAt,
        finishedAt: new Date(),
        status: "FAILED",
        errorMessage: result.errorMessage,
      },
    });
    return result;
  }

  await backupExcelFile(excelPath);

  const result = await syncPendingStockToExcel(prisma, excelPath);

  await prisma.excelSyncLog.create({
    data: {
      startedAt,
      finishedAt: new Date(),
      status: result.status === "NOOP" ? "SUCCESS" : result.status,
      cellsWritten: result.cellsWritten,
      lockDetected: result.lockDetected,
      errorMessage: result.errorMessage,
    },
  });

  return result;
}
