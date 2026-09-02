import type { Brand, PrismaClient } from "@prisma/client";
import { parseTintaExcel, type ReadWarning } from "./reader";

function toBrand(text: string): Brand {
  const upper = text.trim().toUpperCase();
  if (upper === "EPSON") return "EPSON";
  if (upper === "BROTHER") return "BROTHER";
  if (upper === "HP") return "HP";
  return "OTHER";
}

export interface ImportResult {
  printersImported: number;
  warnings: ReadWarning[];
}

/**
 * Importa/reimporta departamentos, impresoras, filas de cartucho y celdas
 * STOCK/PEDIR desde el Excel real. Es seguro volver a ejecutarlo cuantas
 * veces haga falta (upsert por nombre/SKU, nunca duplica) — es exactamente
 * así como se añade una impresora nueva: se añade su fila en el Excel
 * siguiendo el mismo formato que las demás, y se reimporta.
 */
export async function importFromExcel(prisma: PrismaClient, filePath: string): Promise<ImportResult> {
  const { printers, warnings } = await parseTintaExcel(filePath);

  for (const p of printers) {
    const department = await prisma.department.upsert({
      where: { name: p.department },
      update: {},
      create: { name: p.department },
    });

    const printer = await prisma.printer.upsert({
      where: { departmentId_name: { departmentId: department.id, name: p.department } },
      update: {
        ip: p.ip,
        brand: toBrand(p.brand),
        model: p.model,
        excelRowAnchor: p.rows[0]?.excelRowIndex ?? null,
      },
      create: {
        departmentId: department.id,
        name: p.department,
        ip: p.ip,
        brand: toBrand(p.brand),
        model: p.model,
        excelRowAnchor: p.rows[0]?.excelRowIndex ?? null,
      },
    });

    for (const row of p.rows) {
      // Nota: no se usa `upsert` porque tintaColorSku/tintaNegroSku son
      // nullable y Prisma no admite null en claves compuestas de findUnique.
      const existingRow = await prisma.printerCartridgeRow.findFirst({
        where: { printerId: printer.id, tintaColorSku: row.tintaColorSku, tintaNegroSku: row.tintaNegroSku },
      });
      const cartridgeRow = existingRow
        ? await prisma.printerCartridgeRow.update({
            where: { id: existingRow.id },
            data: { excelRowIndex: row.excelRowIndex },
          })
        : await prisma.printerCartridgeRow.create({
            data: {
              printerId: printer.id,
              skuGeneration: row.skuGeneration,
              tintaColorSku: row.tintaColorSku,
              tintaNegroSku: row.tintaNegroSku,
              excelRowIndex: row.excelRowIndex,
            },
          });

      for (const cell of row.stockCells) {
        await prisma.stockCell.upsert({
          where: { cartridgeRowId_colorSlot: { cartridgeRowId: cartridgeRow.id, colorSlot: cell.colorSlot } },
          update: {
            cellType: cell.cellType,
            pendingQty: cell.pendingQty,
            stockOnHand: cell.stockOnHand,
            // Lo que hay en el Excel en el momento de importar se considera
            // ya sincronizado por definición: no hay nada que volver a escribir.
            syncedPendingQty: cell.pendingQty,
            syncedStockOnHand: cell.stockOnHand,
            lastSyncedAt: new Date(),
          },
          create: {
            cartridgeRowId: cartridgeRow.id,
            colorSlot: cell.colorSlot,
            cellType: cell.cellType,
            pendingQty: cell.pendingQty,
            stockOnHand: cell.stockOnHand,
            syncedPendingQty: cell.pendingQty,
            syncedStockOnHand: cell.stockOnHand,
            lastSyncedAt: new Date(),
          },
        });
      }
    }
  }

  return { printersImported: printers.length, warnings };
}
