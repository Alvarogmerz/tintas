import { prisma } from "@/lib/db";
import { syncExcelNow } from "@/lib/excel/sync";
import { PedidosGrid, type PedidoCardData } from "@/components/pedidos-grid";
import { SyncExcelButton } from "@/components/sync-excel-button";

export default async function PedidosPage() {
  // Igual que en la ficha de cada impresora: antes de mostrar nada se
  // compara con el Excel real (por si alguien lo ha tocado a mano) y se
  // intenta volcar lo que estuviera pendiente de escribir.
  const syncResult = await syncExcelNow(prisma);

  const printers = await prisma.printer.findMany({
    include: {
      department: true,
      cartridgeRows: {
        orderBy: { excelRowIndex: "asc" },
        include: { stockCells: true },
      },
    },
    orderBy: { department: { name: "asc" } },
  });

  const cards: PedidoCardData[] = printers
    .filter((p) => p.cartridgeRows.some((row) => row.stockCells.some((c) => c.cellType !== "X")))
    .map((p) => ({
      printerId: p.id,
      department: p.department.name,
      brand: p.brand,
      model: p.model,
      rows: p.cartridgeRows.map((row) => ({
        id: row.id,
        skuGeneration: row.skuGeneration,
        tintaColorSku: row.tintaColorSku,
        tintaNegroSku: row.tintaNegroSku,
        cells: row.stockCells.map((c) => ({
          id: c.id,
          colorSlot: c.colorSlot,
          cellType: c.cellType,
          pendingQty: c.pendingQty,
          stockOnHand: c.stockOnHand,
        })),
      })),
    }));

  const pendingCount = cards.reduce(
    (sum, c) => sum + c.rows.reduce((s, r) => s + r.cells.filter((cell) => cell.cellType === "NUMBER").length, 0),
    0,
  );

  return (
    <div className="space-y-4">
      <h1 className="text-lg font-semibold text-slate-900">Pedidos</h1>
      <p className="text-sm text-slate-500">
        {pendingCount} celda(s) con pedido pendiente. Pulsa &quot;Comprobar pedido&quot; para revisarlo: si ha llegado
        tal cual, márcalo como correcto; si no, puedes corregir cuánto ha llegado de cada color (lo que falte se
        queda en PEDIR). También puedes editar cualquier celda de STOCK o PEDIR a mano en la tabla.
      </p>

      {syncResult.status === "DEFERRED_LOCKED" && (
        <div className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-700">
          ⚠ El Excel está abierto por alguien ahora mismo (probablemente tú). Mientras esté abierto, los cambios se
          guardan aquí pero <strong>no</strong> se escriben en el archivo. Ciérralo y pulsa &quot;Guardar&quot; para
          volcar todo lo pendiente:
          <div className="mt-2">
            <SyncExcelButton />
          </div>
        </div>
      )}
      {syncResult.status === "MISSING" && (
        <div className="rounded-md border-2 border-red-300 bg-red-50 px-3 py-2 text-sm font-medium text-red-700">
          ⚠ No se encuentra el archivo Excel en el servidor. Los cambios se siguen guardando aquí, pero nada se
          refleja en el archivo hasta que vuelva a existir. Ve a Ajustes para restaurarlo desde la última copia de
          seguridad.
        </div>
      )}

      <PedidosGrid cards={cards} />
    </div>
  );
}
