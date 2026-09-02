import Link from "next/link";
import { prisma } from "@/lib/db";
import { getSetting } from "@/lib/settings";
import { StatusBadge } from "@/components/status-badge";

const COLOR_ORDER = ["CYAN", "MAGENTA", "AMARILLO", "TRICOLOR", "NEGRO"] as const;
const COLOR_LABEL: Record<string, string> = {
  CYAN: "Cian",
  MAGENTA: "Magenta",
  AMARILLO: "Amarillo",
  TRICOLOR: "Tricolor",
  NEGRO: "Negro",
};

export default async function PrintersPage() {
  const [printers, threshold] = await Promise.all([
    prisma.printer.findMany({
      include: {
        department: true,
        readings: { orderBy: { readAt: "desc" }, take: 20 },
        cartridgeRows: { include: { stockCells: true } },
      },
      orderBy: { department: { name: "asc" } },
    }),
    getSetting(prisma, "reorderThresholdPercent"),
  ]);

  return (
    <div className="space-y-4">
      <h1 className="text-lg font-semibold text-slate-900">Impresoras</h1>

      <div className="overflow-x-auto rounded-2xl border border-slate-200/70 bg-white shadow-sm shadow-slate-200/50">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
            <tr>
              <th className="px-4 py-2">Departamento</th>
              <th className="px-4 py-2">Marca / Modelo</th>
              <th className="px-4 py-2">IP</th>
              {COLOR_ORDER.map((c) => (
                <th key={c} className="px-3 py-2 text-center">
                  {COLOR_LABEL[c]}
                </th>
              ))}
              <th className="px-4 py-2">Última vez vista</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {printers.map((printer) => {
              const latestByColor = new Map<string, { levelPercent: number | null; criticalAlert: boolean }>();
              for (const reading of printer.readings) {
                if (!latestByColor.has(reading.colorSlot)) {
                  latestByColor.set(reading.colorSlot, {
                    levelPercent: reading.levelPercent,
                    criticalAlert: reading.criticalAlert,
                  });
                }
              }

              // Un color se considera "no aplica" a esta impresora si todas sus
              // celdas STOCK (en todas las filas de cartucho) están marcadas "X".
              const notApplicable = new Set(
                COLOR_ORDER.filter((color) => {
                  const cells = printer.cartridgeRows.flatMap((row) =>
                    row.stockCells.filter((c) => c.colorSlot === color),
                  );
                  return cells.length > 0 && cells.every((c) => c.cellType === "X");
                }),
              );

              const numericLevels = [...latestByColor.values()].map((v) => v.levelPercent).filter((v): v is number => v !== null);
              const anyCriticalAlert = [...latestByColor.values()].some((v) => v.criticalAlert);
              const min = numericLevels.length > 0 ? Math.min(...numericLevels) : null;
              const tone = anyCriticalAlert
                ? "critical"
                : min === null
                  ? "neutral"
                  : min < threshold
                    ? "critical"
                    : min < threshold * 1.5
                      ? "warn"
                      : "ok";

              return (
                <tr key={printer.id} className="hover:bg-slate-50">
                  <td className="px-4 py-2">
                    <Link href={`/impresoras/${printer.id}`} className="font-medium text-slate-900 hover:underline">
                      {printer.department.name}
                    </Link>
                    {printer.lastError && <p className="mt-0.5 text-xs text-red-600">{printer.lastError}</p>}
                  </td>
                  <td className="px-4 py-2 text-slate-600">
                    {printer.brand} {printer.model}
                  </td>
                  <td className="px-4 py-2 text-slate-600">{printer.ip ?? "—"}</td>
                  {COLOR_ORDER.map((color) => {
                    if (notApplicable.has(color)) {
                      return (
                        <td key={color} className="px-3 py-2 text-center text-slate-300">
                          —
                        </td>
                      );
                    }
                    const entry = latestByColor.get(color);
                    if (entry === undefined) {
                      return (
                        <td key={color} className="px-3 py-2 text-center text-xs text-slate-400">
                          sin dato
                        </td>
                      );
                    }
                    if (entry.criticalAlert) {
                      return (
                        <td key={color} className="px-3 py-2 text-center">
                          <span className="rounded bg-red-100 px-1.5 py-0.5 text-[11px] font-semibold text-red-700">
                            SIN TÓNER
                          </span>
                        </td>
                      );
                    }
                    if (entry.levelPercent === null) {
                      return (
                        <td key={color} className="px-3 py-2 text-center text-xs text-slate-400">
                          n/d
                        </td>
                      );
                    }
                    const low = entry.levelPercent < threshold;
                    return (
                      <td
                        key={color}
                        className={`px-3 py-2 text-center font-medium ${low ? "text-red-600" : "text-slate-700"}`}
                      >
                        {entry.levelPercent}%
                      </td>
                    );
                  })}
                  <td className="px-4 py-2 text-slate-500">
                    <StatusBadge tone={tone}>
                      {printer.lastSeenAt ? printer.lastSeenAt.toLocaleString("es-ES") : "Nunca"}
                    </StatusBadge>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
