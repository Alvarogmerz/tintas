import ExcelJS from "exceljs";
import path from "node:path";
import fs from "node:fs/promises";
import { COL, COLOR_SLOT_TO_PEDIR_COLUMN, COLOR_SLOT_TO_STOCK_COLUMN, SHEET_NAME, type ColorSlotKey } from "./mapping";
import { isExcelLockedByEditor } from "./lock";
import type { PrismaClient } from "@prisma/client";

export interface SyncResult {
  status: "SUCCESS" | "DEFERRED_LOCKED" | "FAILED" | "NOOP" | "MISSING";
  cellsWritten: number;
  lockDetected: boolean;
  errorMessage?: string;
}

function cellText(value: ExcelJS.CellValue): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "object" && "text" in value) return String(value.text ?? "");
  if (typeof value === "object" && "result" in value) return String(value.result ?? "");
  return String(value);
}

function classifyLive(raw: ExcelJS.CellValue): { cellType: "BLANK" | "NUMBER" | "X"; value: number | null } {
  const trimmed = cellText(raw).trim();
  if (trimmed === "") return { cellType: "BLANK", value: null };
  if (trimmed.toUpperCase() === "X") return { cellType: "X", value: null };
  const asNumber = Number(trimmed);
  if (Number.isFinite(asNumber)) return { cellType: "NUMBER", value: asNumber };
  return { cellType: "BLANK", value: null };
}

interface Reconciled {
  nextDesired: number | null;
  nextSynced: number | null;
  writeValue?: number | null;
}

/**
 * Compara un valor "deseado" (lo que la app quiere que haya) contra el valor
 * real leído del archivo, usando el último valor "confirmado" (la última vez
 * que se supo con certeza qué había en el archivo) para distinguir dos
 * situaciones que, sin ese dato, se ven idénticas:
 *
 *   - El archivo cambió desde la última vez que se miró (`live !== synced`):
 *     gana el archivo, se adopta tal cual.
 *   - El archivo sigue como la última vez, pero ahora se quiere otra cosa
 *     (`desired !== live`): se escribe el valor deseado.
 */
function reconcile(desired: number | null, synced: number | null, live: number | null): Reconciled {
  if (live !== synced) {
    return { nextDesired: live, nextSynced: live };
  }
  if (desired !== live) {
    return { nextDesired: desired, nextSynced: desired, writeValue: desired };
  }
  return { nextDesired: desired, nextSynced: desired };
}

/**
 * Reconcilia BD <-> Excel real para los dos bloques de columnas (STOCK y
 * PEDIR) y escribe lo que haga falta. El archivo (lo que escribió o dejó una
 * persona) siempre gana en caso de conflicto.
 */
export async function syncPendingStockToExcel(
  prisma: PrismaClient,
  excelPath: string,
): Promise<SyncResult> {
  if (await isExcelLockedByEditor(excelPath)) {
    return { status: "DEFERRED_LOCKED", cellsWritten: 0, lockDetected: true };
  }

  let workbook: ExcelJS.Workbook;
  try {
    workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(excelPath);
  } catch (err) {
    const missing = (err as NodeJS.ErrnoException).code === "ENOENT";
    return {
      status: missing ? "MISSING" : "FAILED",
      cellsWritten: 0,
      lockDetected: false,
      errorMessage: missing ? "El archivo Excel no existe en la ruta configurada" : `No se pudo abrir el Excel: ${(err as Error).message}`,
    };
  }

  // OJO: no se filtran aquí las celdas ya marcadas "X" en BD. Si se hiciera,
  // en cuanto una celda se marca X quedaría excluida para siempre de futuras
  // comprobaciones, y la app se quedaría "ciega" si alguien la desmarca más
  // tarde en el Excel (p.ej. para pasar de usar el cartucho XL al normal) —
  // el bucle de abajo ya sabe reconciliar tanto marcar como desmarcar X.
  const cells = await prisma.stockCell.findMany({
    include: { cartridgeRow: true },
  });

  if (cells.length === 0) {
    return { status: "NOOP", cellsWritten: 0, lockDetected: false };
  }

  const sheet = workbook.getWorksheet(SHEET_NAME);
  if (!sheet) {
    return { status: "FAILED", cellsWritten: 0, lockDetected: false, errorMessage: `Hoja "${SHEET_NAME}" no encontrada` };
  }

  let cellsWritten = 0;
  let dirty = false;
  // Se preparan todas las escrituras a BD sin ejecutarlas todavía, y se
  // aplican de golpe en una única transacción al final — 85 escrituras
  // sueltas seguidas (una por celda) pueden agotar el timeout de SQLite en
  // un disco lento; una sola transacción es muchísimo más rápida y segura.
  const dbUpdates: ReturnType<PrismaClient["stockCell"]["update"]>[] = [];
  const now = new Date();

  for (const cell of cells) {
    const stockColIndex = COLOR_SLOT_TO_STOCK_COLUMN[cell.colorSlot as ColorSlotKey];
    const pedirColIndex = COLOR_SLOT_TO_PEDIR_COLUMN[cell.colorSlot as ColorSlotKey];
    const row = sheet.getRow(cell.cartridgeRow.excelRowIndex + 1);
    const stockExcelCell = row.getCell(stockColIndex + 1);
    const pedirExcelCell = row.getCell(pedirColIndex + 1);

    const liveStock = classifyLive(stockExcelCell.value);
    const livePedir = classifyLive(pedirExcelCell.value);

    if (liveStock.cellType === "X" || livePedir.cellType === "X") {
      // No debería pasar (nunca marcamos NUMBER sobre una celda X), pero si
      // el archivo cambió por debajo, la máscara del archivo manda.
      dbUpdates.push(
        prisma.stockCell.update({
          where: { id: cell.id },
          data: {
            cellType: "X",
            pendingQty: null,
            syncedPendingQty: null,
            stockOnHand: 0,
            syncedStockOnHand: null,
            lastSyncedAt: now,
          },
        }),
      );
      continue;
    }

    const pedirResult = reconcile(
      cell.cellType === "NUMBER" ? cell.pendingQty : null,
      cell.syncedPendingQty,
      livePedir.value,
    );
    const stockResult = reconcile(cell.stockOnHand, cell.syncedStockOnHand, liveStock.value ?? 0);

    if (pedirResult.writeValue !== undefined) {
      pedirExcelCell.value = pedirResult.writeValue;
      dirty = true;
      cellsWritten++;
    }
    if (stockResult.writeValue !== undefined) {
      stockExcelCell.value = stockResult.writeValue;
      dirty = true;
      cellsWritten++;
    }

    dbUpdates.push(
      prisma.stockCell.update({
        where: { id: cell.id },
        data: {
          cellType: pedirResult.nextDesired === null ? "BLANK" : "NUMBER",
          pendingQty: pedirResult.nextDesired,
          syncedPendingQty: pedirResult.nextSynced,
          stockOnHand: stockResult.nextDesired ?? 0,
          syncedStockOnHand: stockResult.nextSynced,
          lastSyncedAt: now,
        },
      }),
    );
  }

  if (dbUpdates.length > 0) {
    try {
      await prisma.$transaction(dbUpdates);
    } catch (err) {
      return {
        status: "FAILED",
        cellsWritten: 0,
        lockDetected: false,
        errorMessage: `No se pudo guardar en la base de datos: ${(err as Error).message}`,
      };
    }
  }

  if (!dirty) {
    return { status: "NOOP", cellsWritten: 0, lockDetected: false };
  }

  const dir = path.dirname(excelPath);
  const tmpPath = path.join(dir, `.tintas-auto-tmp-${Date.now()}.xlsx`);
  try {
    await workbook.xlsx.writeFile(tmpPath);
    await fs.rename(tmpPath, excelPath);
  } catch (err) {
    await fs.rm(tmpPath, { force: true }).catch(() => {});
    return {
      status: "FAILED",
      cellsWritten: 0,
      lockDetected: false,
      errorMessage: `No se pudo escribir el Excel: ${(err as Error).message}`,
    };
  }

  return { status: "SUCCESS", cellsWritten, lockDetected: false };
}

export interface WriteIdentityResult {
  status: "SUCCESS" | "DEFERRED_LOCKED" | "FAILED";
  errorMessage?: string;
}

/**
 * Escribe IP/MARCA/MODELO de una impresora en su fila ancla del Excel (la
 * primera fila del grupo fusionado — IP/MARCA/MODELO son campos únicos por
 * impresora, no por color, así que se sobrescriben directamente con lo que
 * haya en BD en vez de usar el mismo reconcile bidireccional que STOCK/PEDIR
 * (estos campos los cambia un administrador de vez en cuando, no a diario
 * como el stock, así que no hace falta ese nivel de cuidado).
 */
export async function writePrinterIdentityToExcel(
  prisma: PrismaClient,
  excelPath: string,
  printerId: number,
): Promise<WriteIdentityResult> {
  if (await isExcelLockedByEditor(excelPath)) {
    return { status: "DEFERRED_LOCKED" };
  }

  const printer = await prisma.printer.findUnique({
    where: { id: printerId },
    include: { cartridgeRows: true },
  });
  if (!printer || printer.cartridgeRows.length === 0) {
    return { status: "FAILED", errorMessage: "Impresora sin filas de Excel asociadas" };
  }

  const anchorRow = printer.cartridgeRows.reduce((min, r) => (r.excelRowIndex < min.excelRowIndex ? r : min));

  let workbook: ExcelJS.Workbook;
  try {
    workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(excelPath);
  } catch (err) {
    return { status: "FAILED", errorMessage: `No se pudo abrir el Excel: ${(err as Error).message}` };
  }

  const sheet = workbook.getWorksheet(SHEET_NAME);
  if (!sheet) {
    return { status: "FAILED", errorMessage: `Hoja "${SHEET_NAME}" no encontrada` };
  }

  const row = sheet.getRow(anchorRow.excelRowIndex + 1);
  row.getCell(COL.IP + 1).value = printer.ip;
  row.getCell(COL.MARCA + 1).value = printer.brand;
  row.getCell(COL.MODELO + 1).value = printer.model;

  const dir = path.dirname(excelPath);
  const tmpPath = path.join(dir, `.tintas-auto-tmp-${Date.now()}.xlsx`);
  try {
    await workbook.xlsx.writeFile(tmpPath);
    await fs.rename(tmpPath, excelPath);
  } catch (err) {
    await fs.rm(tmpPath, { force: true }).catch(() => {});
    return { status: "FAILED", errorMessage: `No se pudo escribir el Excel: ${(err as Error).message}` };
  }

  return { status: "SUCCESS" };
}
