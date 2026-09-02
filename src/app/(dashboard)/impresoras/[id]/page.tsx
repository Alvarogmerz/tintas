import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { syncExcelNow } from "@/lib/excel/sync";
import { getCurrentUser } from "@/lib/auth/guards";
import { StockCellEditor } from "@/components/stock-cell-editor";
import { InkLevelChart, type ChartPoint } from "@/components/ink-level-chart";
import { StatusBadge } from "@/components/status-badge";
import { SyncExcelButton } from "@/components/sync-excel-button";
import { EditPrinterForm } from "@/components/edit-printer-form";
import { TestConnectionButton } from "@/components/test-connection-button";

const COLOR_ORDER = ["CYAN", "MAGENTA", "AMARILLO", "TRICOLOR", "NEGRO"] as const;
const COLOR_LABEL: Record<string, string> = {
  CYAN: "Cian",
  MAGENTA: "Magenta",
  AMARILLO: "Amarillo",
  TRICOLOR: "Tricolor",
  NEGRO: "Negro",
};

function daysAgo(n: number): Date {
  return new Date(Date.now() - n * 24 * 60 * 60 * 1000);
}

export default async function PrinterDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const printerId = Number(id);

  // Antes de mostrar la impresora, se compara con el Excel real: si alguien
  // ha cambiado algo a mano en el archivo desde la última vez, se refleja
  // aquí (y de paso se escribe lo que estuviera pendiente y aún no se hubiera
  // podido volcar, p.ej. porque el archivo estaba abierto).
  const syncResult = await syncExcelNow(prisma);
  const user = await getCurrentUser();

  const printer = await prisma.printer.findUnique({
    where: { id: printerId },
    include: {
      department: true,
      cartridgeRows: {
        include: { stockCells: true },
        orderBy: { excelRowIndex: "asc" },
      },
    },
  });
  if (!printer) notFound();

  const [readings, pollResults] = await Promise.all([
    prisma.inkLevelReading.findMany({
      // Últimos 30 días: con el histórico ahora agregado por día (ver más
      // abajo), hace falta rango de fechas suficiente para que el gráfico
      // tenga varios puntos, no solo los últimos ~200 sondeos (que a 5
      // minutos apenas cubren medio día).
      where: { printerId, readAt: { gte: daysAgo(30) } },
      orderBy: { readAt: "asc" },
    }),
    prisma.pollCyclePrinterResult.findMany({
      where: { printerId },
      include: { pollCycle: true },
      orderBy: { id: "desc" },
      take: 10,
    }),
  ]);

  // Un punto por día (el último valor leído ese día), no por cada sondeo —
  // con un sondeo cada pocos minutos, mostrar cada lectura haría el eje
  // ilegible y no aporta nada para ver la tendencia de consumo.
  const byDay = new Map<string, ChartPoint>();
  for (const r of [...readings].reverse()) {
    const key = r.readAt.toLocaleDateString("es-ES", { day: "2-digit", month: "2-digit" });
    if (!byDay.has(key)) byDay.set(key, { readAt: key });
    byDay.get(key)![r.colorSlot] = r.levelPercent;
  }
  const chartData = [...byDay.values()];
  const presentColors = [...new Set(readings.map((r) => r.colorSlot))];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-lg font-semibold text-slate-900">{printer.department.name}</h1>
        <p className="text-sm text-slate-500">
          {printer.brand} {printer.model} · {printer.ip ?? "sin IP"}
        </p>
        {printer.lastError && (
          <p className="mt-1 text-sm text-red-600">Último error de sondeo: {printer.lastError}</p>
        )}
        {syncResult.status === "DEFERRED_LOCKED" && (
          <p className="mt-1 text-sm text-amber-600">
            El Excel está abierto por alguien ahora mismo — lo que ves aquí puede no incluir cambios hechos a mano en
            el archivo todavía sin guardar y cerrar.
          </p>
        )}
        {syncResult.status === "MISSING" && (
          <p className="mt-1 text-sm font-medium text-red-600">
            ⚠ No se encuentra el archivo Excel en el servidor — ve a Ajustes para restaurarlo desde la última copia
            de seguridad.
          </p>
        )}
        <div className="mt-3">
          <TestConnectionButton printerId={printer.id} />
        </div>
      </div>

      {user?.role === "ADMIN" && (
        <section className="rounded-2xl border border-slate-200/70 bg-white shadow-sm shadow-slate-200/50 p-4">
          <h2 className="mb-3 text-sm font-medium text-slate-900">Configuración de la impresora</h2>
          <EditPrinterForm
            printerId={printer.id}
            ip={printer.ip}
            brand={printer.brand}
            model={printer.model}
            snmpCommunity={printer.snmpCommunity}
            snmpVersion={printer.snmpVersion}
            snmpPort={printer.snmpPort}
            isActive={printer.isActive}
          />
        </section>
      )}

      <section className="rounded-2xl border border-slate-200/70 bg-white shadow-sm shadow-slate-200/50 p-4">
        <h2 className="mb-3 text-sm font-medium text-slate-900">STOCK y PEDIR (igual que en el Excel)</h2>
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="text-left text-xs uppercase text-slate-500">
              <tr>
                <th className="px-3 py-2" rowSpan={2}>
                  Cartucho
                </th>
                <th className="px-3 py-2" rowSpan={2}>
                  SKU color
                </th>
                <th className="px-3 py-2" rowSpan={2}>
                  SKU negro
                </th>
                <th className="border-l border-slate-200 bg-blue-50 px-3 py-1 text-center" colSpan={5}>
                  STOCK
                </th>
                <th className="border-l border-slate-200 bg-amber-50 px-3 py-1 text-center" colSpan={5}>
                  PEDIR
                </th>
              </tr>
              <tr>
                {COLOR_ORDER.map((c) => (
                  <th key={`stock-${c}`} className="border-l border-slate-200 bg-blue-50/50 px-3 py-1 text-center">
                    {COLOR_LABEL[c]}
                  </th>
                ))}
                {COLOR_ORDER.map((c) => (
                  <th key={`pedir-${c}`} className="border-l border-slate-200 bg-amber-50/50 px-3 py-1 text-center">
                    {COLOR_LABEL[c]}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {printer.cartridgeRows.map((row) => (
                <tr key={row.id}>
                  <td className="px-3 py-2 font-medium text-slate-700">{row.skuGeneration}</td>
                  <td className="px-3 py-2 text-slate-600">{row.tintaColorSku ?? "—"}</td>
                  <td className="px-3 py-2 text-slate-600">{row.tintaNegroSku ?? "—"}</td>
                  {COLOR_ORDER.map((color) => {
                    const cell = row.stockCells.find((c) => c.colorSlot === color);
                    if (!cell) return <td key={`stock-${color}`} className="border-l border-slate-100 px-3 py-2" />;
                    return (
                      <td key={`stock-${color}`} className="border-l border-slate-100 px-3 py-2">
                        <StockCellEditor cellId={cell.id} cellType={cell.cellType} variant="stock" value={cell.stockOnHand} />
                      </td>
                    );
                  })}
                  {COLOR_ORDER.map((color) => {
                    const cell = row.stockCells.find((c) => c.colorSlot === color);
                    if (!cell) return <td key={`pedir-${color}`} className="border-l border-slate-100 px-3 py-2" />;
                    return (
                      <td key={`pedir-${color}`} className="border-l border-slate-100 px-3 py-2">
                        <StockCellEditor cellId={cell.id} cellType={cell.cellType} variant="pedir" value={cell.pendingQty} />
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-2 text-xs text-slate-500">
          STOCK son las existencias en almacén; PEDIR es la cantidad pendiente de pedir. Deja una celda de PEDIR
          vacía cuando el pedido se haya recibido (o hazlo desde &quot;Pedidos&quot;, que además suma a STOCK
          automáticamente). Cada cambio se intenta escribir en el Excel al momento; si el archivo está abierto se
          queda pendiente — usa &quot;Guardar&quot; para reintentarlo.
        </p>
        <div className="mt-3">
          <SyncExcelButton />
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200/70 bg-white shadow-sm shadow-slate-200/50 p-4">
        <h2 className="mb-3 text-sm font-medium text-slate-900">Histórico de nivel de tinta</h2>
        <InkLevelChart data={chartData} colors={presentColors} />
      </section>

      <section className="rounded-2xl border border-slate-200/70 bg-white shadow-sm shadow-slate-200/50 p-4">
        <h2 className="mb-3 text-sm font-medium text-slate-900">Últimos sondeos</h2>
        <table className="w-full text-sm">
          <thead className="text-left text-xs uppercase text-slate-500">
            <tr>
              <th className="px-3 py-2">Fecha</th>
              <th className="px-3 py-2">Resultado</th>
              <th className="px-3 py-2">Duración</th>
              <th className="px-3 py-2">Detalle</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {pollResults.map((r) => (
              <tr key={r.id}>
                <td className="px-3 py-2 text-slate-600">{r.pollCycle.startedAt.toLocaleString("es-ES")}</td>
                <td className="px-3 py-2">
                  <StatusBadge tone={r.success ? "ok" : "critical"}>{r.success ? "OK" : "Error"}</StatusBadge>
                </td>
                <td className="px-3 py-2 text-slate-600">{r.durationMs ? `${r.durationMs} ms` : "—"}</td>
                <td className="px-3 py-2 text-slate-600">{r.errorMessage ?? `${r.readingsCount} lectura(s)`}</td>
              </tr>
            ))}
            {pollResults.length === 0 && (
              <tr>
                <td colSpan={4} className="px-3 py-4 text-center text-slate-400">
                  Sin sondeos todavía.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </section>
    </div>
  );
}
