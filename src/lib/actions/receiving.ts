"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "../db";
import { requireUser } from "../auth/guards";
import { syncExcelNow } from "../excel/sync";

export interface ReceivedItem {
  cellId: number;
  receivedQty: number;
}

export interface ReceiveStockResult {
  error?: string;
  receivedCount?: number;
  syncMessage?: string;
}

/**
 * Confirma la recepción de un pedido, item a item. `receivedQty` puede ser
 * menor que lo pedido (recepción parcial): lo que llega se suma a STOCK, y
 * lo que falta se queda pendiente en PEDIR (p.ej. pedidos=3, llegan=2 ->
 * PEDIR queda en 1, STOCK sube en 2). Si llega 0 de un color, esa celda no
 * se toca. Deja constancia en ReceiptEvent y sincroniza con el Excel real
 * al momento (STOCK y PEDIR).
 */
export async function receiveStockAction(items: ReceivedItem[]): Promise<ReceiveStockResult> {
  const user = await requireUser();

  if (items.length === 0) return { error: "No hay nada que recepcionar." };

  const cells = await prisma.stockCell.findMany({
    where: { id: { in: items.map((i) => i.cellId) } },
    include: { cartridgeRow: true },
  });
  const cellById = new Map(cells.map((c) => [c.id, c]));

  let receivedCount = 0;

  for (const item of items) {
    const cell = cellById.get(item.cellId);
    if (!cell || cell.cellType !== "NUMBER" || cell.pendingQty === null) continue;

    const received = Math.max(0, Math.trunc(item.receivedQty));
    if (received <= 0) continue; // nada de este color en este pedido, se deja como está

    const ordered = cell.pendingQty;
    const remainder = ordered - received;
    const newPendingQty = remainder > 0 ? remainder : null;

    await prisma.receiptEvent.create({
      data: {
        printerId: cell.cartridgeRow.printerId,
        colorSlot: cell.colorSlot,
        qtyReceived: received,
        cartridgeRowIds: JSON.stringify([cell.cartridgeRowId]),
        receivedByUserId: user.id,
      },
    });

    await prisma.stockCell.update({
      where: { id: cell.id },
      data: {
        stockOnHand: { increment: received },
        cellType: newPendingQty === null ? "BLANK" : "NUMBER",
        pendingQty: newPendingQty,
        // syncedPendingQty / syncedStockOnHand se dejan igual a propósito
        // (ver writer.ts): así el próximo sync sabe que tiene que escribir
        // estos cambios de verdad en el Excel, en vez de confundir el valor
        // viejo con una edición manual hecha directamente en el archivo.
        updatedByUserId: user.id,
      },
    });
    receivedCount++;
  }

  if (receivedCount === 0) {
    return { error: "No se ha recepcionado nada (todas las cantidades introducidas eran 0)." };
  }

  revalidatePath("/pedidos");
  revalidatePath("/impresoras");

  const syncResult = await syncExcelNow(prisma);
  let syncMessage: string | undefined;
  if (syncResult.status === "DEFERRED_LOCKED") {
    syncMessage = "El Excel está abierto ahora mismo — se actualizará en el archivo en cuanto se cierre.";
  } else if (syncResult.status === "MISSING") {
    syncMessage = "No se encuentra el archivo Excel en el servidor — ve a Ajustes para restaurarlo.";
  } else if (syncResult.status === "FAILED") {
    syncMessage = `No se pudo actualizar el Excel: ${syncResult.errorMessage ?? "error desconocido"}.`;
  }

  return { receivedCount, syncMessage };
}
