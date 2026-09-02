"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "../db";
import { requireUser } from "../auth/guards";
import { syncExcelNow } from "../excel/sync";

export interface UpdateStockCellResult {
  error?: string;
  warning?: string;
}

/**
 * Edición manual de una celda STOCK desde el panel. Pasa por las mismas
 * reglas que el poller: nunca se puede escribir sobre una celda marcada "X".
 * Tras guardar en la base de datos, intenta reflejarlo también en el Excel
 * real al momento (en vez de esperar al siguiente ciclo del worker), para
 * que ambos no se desincronicen mientras alguien esté editando desde aquí.
 */
export async function updateStockCellAction(cellId: number, value: string): Promise<UpdateStockCellResult> {
  const user = await requireUser();

  const cell = await prisma.stockCell.findUnique({ where: { id: cellId } });
  if (!cell) return { error: "Celda no encontrada." };
  if (cell.cellType === "X") return { error: "Esta celda no aplica a esta impresora (X) y no se puede editar." };

  const trimmed = value.trim();

  if (trimmed === "") {
    // syncedPendingQty se deja igual a propósito: sigue guardando el último
    // valor que sabemos que hay de verdad en el Excel. Así, si la
    // sincronización de abajo no puede escribir ahora (archivo abierto), el
    // próximo intento seguirá sabiendo que hay que vaciar esa celda en vez
    // de confundir el valor viejo (todavía sin borrar) con una edición
    // nueva hecha a mano en el archivo.
    await prisma.stockCell.update({
      where: { id: cellId },
      data: { cellType: "BLANK", pendingQty: null, updatedByUserId: user.id },
    });
  } else {
    const qty = Number(trimmed);
    if (!Number.isFinite(qty) || qty < 0 || !Number.isInteger(qty)) {
      return { error: "La cantidad debe ser un número entero." };
    }
    // syncedPendingQty se deja igual: si ya era distinto del nuevo qty (o
    // null), la sincronización de abajo (o el próximo intento, si esta
    // falla) sabrá que hay que escribir este valor nuevo en el Excel.
    await prisma.stockCell.update({
      where: { id: cellId },
      data: { cellType: "NUMBER", pendingQty: qty, updatedByUserId: user.id },
    });
  }

  revalidatePath("/impresoras");
  revalidatePath("/pedidos");

  const warning = await describeSyncOutcome();
  return warning ? { warning } : {};
}

/**
 * Edición manual de una celda STOCK (existencias en almacén, no "pedir") —
 * misma mecánica que updateStockCellAction: guarda, intenta sincronizar con
 * el Excel al momento, y no toca "syncedStockOnHand" hasta confirmar que se
 * ha escrito de verdad.
 */
export async function updateStockOnHandAction(cellId: number, value: string): Promise<UpdateStockCellResult> {
  const user = await requireUser();

  const cell = await prisma.stockCell.findUnique({ where: { id: cellId } });
  if (!cell) return { error: "Celda no encontrada." };
  if (cell.cellType === "X") return { error: "Esta celda no aplica a esta impresora (X) y no se puede editar." };

  const trimmed = value.trim();
  const qty = trimmed === "" ? 0 : Number(trimmed);
  if (!Number.isFinite(qty) || qty < 0 || !Number.isInteger(qty)) {
    return { error: "La cantidad debe ser un número entero." };
  }

  await prisma.stockCell.update({
    where: { id: cellId },
    data: { stockOnHand: qty, updatedByUserId: user.id },
  });

  revalidatePath("/impresoras");
  revalidatePath("/pedidos");

  const warning = await describeSyncOutcome();
  return warning ? { warning } : {};
}

export interface SyncStockResult {
  message: string;
  isWarning: boolean;
}

/**
 * Acción del botón "Guardar" bajo la cuadrícula STOCK de una impresora (y de
 * cualquier otro sitio que quiera forzar la comparación BD <-> Excel al
 * momento): reconcilia lo que haya cambiado a mano en el Excel hacia la BD,
 * y escribe hacia el Excel lo que esté pendiente en la BD.
 */
export async function syncStockWithExcelAction(): Promise<SyncStockResult> {
  await requireUser();

  const result = await syncExcelNow(prisma);

  revalidatePath("/", "layout");

  if (result.status === "DEFERRED_LOCKED") {
    return { message: "El Excel está abierto por alguien ahora mismo. Ciérralo y vuelve a intentarlo.", isWarning: true };
  }
  if (result.status === "MISSING") {
    return { message: "No se encuentra el archivo Excel en el servidor. Ve a Ajustes para restaurarlo.", isWarning: true };
  }
  if (result.status === "FAILED") {
    return { message: `No se pudo sincronizar: ${result.errorMessage ?? "error desconocido"}.`, isWarning: true };
  }
  if (result.cellsWritten > 0) {
    return { message: `Sincronizado: ${result.cellsWritten} celda(s) escrita(s) en el Excel.`, isWarning: false };
  }
  return { message: "Todo estaba ya sincronizado.", isWarning: false };
}

/** Traduce el resultado de una sincronización a un aviso corto para el editor de celdas, o undefined si no hace falta avisar. */
async function describeSyncOutcome(): Promise<string | undefined> {
  const result = await syncExcelNow(prisma);

  if (result.status === "DEFERRED_LOCKED") {
    return "Guardado en la base de datos. El Excel está abierto por alguien ahora mismo — se escribirá en cuanto se cierre (o pulsando \"Guardar\").";
  }
  if (result.status === "MISSING") {
    return "Guardado en la base de datos. No se encuentra el archivo Excel en el servidor — ve a Ajustes para restaurarlo.";
  }
  if (result.status === "FAILED") {
    return `Guardado en la base de datos, pero no se pudo escribir en el Excel: ${result.errorMessage ?? "error desconocido"}.`;
  }
  return undefined;
}
