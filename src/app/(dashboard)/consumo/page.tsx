import { prisma } from "@/lib/db";
import { computeConsumptionRate } from "@/lib/consumption/rate";
import { getSetting } from "@/lib/settings";
import { ConsumptionBars, type ConsumptionRow } from "@/components/consumption-bars";

const COLOR_ORDER = ["CYAN", "MAGENTA", "AMARILLO", "TRICOLOR", "NEGRO"] as const;
const COLOR_LABEL: Record<string, string> = {
  CYAN: "Cian",
  MAGENTA: "Magenta",
  AMARILLO: "Amarillo",
  TRICOLOR: "Tricolor",
  NEGRO: "Negro",
};
const COLOR_DOT: Record<string, string> = {
  CYAN: "bg-cyan-500",
  MAGENTA: "bg-pink-600",
  AMARILLO: "bg-amber-400",
  TRICOLOR: "bg-violet-500",
  NEGRO: "bg-slate-700",
};

function mean(values: number[]): number {
  return values.reduce((a, b) => a + b, 0) / values.length;
}
function stddev(values: number[], avg: number): number {
  if (values.length < 2) return 0;
  return Math.sqrt(values.reduce((s, v) => s + (v - avg) ** 2, 0) / (values.length - 1));
}

export default async function ConsumoPage() {
  const [printers, stddevMultiplier] = await Promise.all([
    prisma.printer.findMany({ where: { isActive: true }, include: { department: true }, orderBy: { department: { name: "asc" } } }),
    getSetting(prisma, "consumptionRuleStddevMultiplier"),
  ]);

  interface Row {
    printerId: number;
    department: string;
    printerLabel: string;
    color: string;
    ratePctPerDay: number | null;
    samples: number;
  }
  const rows: Row[] = [];
  for (const printer of printers) {
    for (const color of COLOR_ORDER) {
      const rate = await computeConsumptionRate(prisma, printer.id, color);
      rows.push({
        printerId: printer.id,
        department: printer.department.name,
        printerLabel: `${printer.brand} ${printer.model}`,
        color,
        ratePctPerDay: rate.ratePctPerDay,
        samples: rate.sampleReadings,
      });
    }
  }

  const statsByColor = new Map<string, { mean: number; stddev: number; threshold: number; sampleSize: number }>();
  for (const color of COLOR_ORDER) {
    const rates = rows.filter((r) => r.color === color && r.ratePctPerDay !== null).map((r) => r.ratePctPerDay!);
    const m = rates.length > 0 ? mean(rates) : 0;
    const sd = stddev(rates, m);
    statsByColor.set(color, { mean: m, stddev: sd, threshold: m + stddevMultiplier * sd, sampleSize: rates.length });
  }

  const withFlag = rows.map((r) => {
    const stats = statsByColor.get(r.color)!;
    const aboveAverage = r.ratePctPerDay !== null && stats.sampleSize >= 2 && r.ratePctPerDay > stats.threshold;
    return { ...r, aboveAverage };
  });

  const aboveCount = withFlag.filter((r) => r.aboveAverage).length;
  const insufficientCount = withFlag.filter((r) => r.ratePctPerDay === null).length;
  const maxRate = Math.max(1, ...withFlag.map((r) => r.ratePctPerDay ?? 0));

  const printerCards = printers.map((printer) => ({
    printer,
    rows: COLOR_ORDER.map((color) => {
      const r = withFlag.find((x) => x.printerId === printer.id && x.color === color)!;
      return { colorSlot: color, ratePctPerDay: r.ratePctPerDay, aboveAverage: r.aboveAverage } satisfies ConsumptionRow;
    }),
  }));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-lg font-semibold text-slate-900">Consumo</h1>
        <p className="text-sm text-slate-500">
          Tasa de bajada de nivel (%/día) desde la última recarga detectada por impresora y color.
        </p>
      </div>

      {/* Bento: tarjetas de distinto tamaño según lo relevante que sea cada dato */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4 lg:grid-cols-6">
        <div className="col-span-2 row-span-2 flex flex-col justify-between rounded-2xl border border-red-200 bg-red-50 p-5 sm:col-span-2">
          <p className="text-xs font-medium uppercase tracking-wide text-red-700">Por encima de la media</p>
          <p className="mt-2 text-5xl font-bold text-red-700">{aboveCount}</p>
          <p className="mt-2 text-xs text-red-700/80">
            color(es) consumiendo más de lo normal frente al resto de la flota — el siguiente pedido pedirá el doble
            automáticamente.
          </p>
        </div>

        <div className="col-span-2 rounded-2xl border border-slate-200 bg-white p-4 sm:col-span-2 lg:col-span-2">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Regla</p>
          <p className="mt-1 text-sm text-slate-700">
            Se marca &quot;por encima de la media&quot; cuando supera <strong>media + {stddevMultiplier}×desviación
            típica</strong> de la flota, comparando siempre dentro del mismo color.
          </p>
        </div>

        <div className="col-span-2 rounded-2xl border border-slate-200 bg-white p-4 sm:col-span-2 lg:col-span-2">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Datos insuficientes</p>
          <p className="mt-2 text-3xl font-bold text-slate-400">{insufficientCount}</p>
          <p className="mt-1 text-xs text-slate-500">combinaciones impresora/color sin histórico suficiente todavía.</p>
        </div>

        {COLOR_ORDER.map((color) => {
          const stats = statsByColor.get(color)!;
          const countAbove = withFlag.filter((r) => r.color === color && r.aboveAverage).length;
          const highlight = countAbove > 0;
          return (
            <div
              key={color}
              className={`rounded-2xl border p-4 ${
                highlight ? "col-span-2 border-amber-200 bg-amber-50" : "col-span-1 border-slate-200 bg-white"
              }`}
            >
              <div className="flex items-center gap-1.5">
                <span className={`h-2.5 w-2.5 rounded-full ${COLOR_DOT[color]}`} />
                <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{COLOR_LABEL[color]}</p>
              </div>
              <p className={`mt-2 text-2xl font-bold ${highlight ? "text-amber-700" : "text-slate-900"}`}>
                {stats.sampleSize > 0 ? `${stats.mean.toFixed(1)}%/d` : "—"}
              </p>
              <p className="mt-1 text-xs text-slate-500">
                media de la flota{countAbove > 0 ? ` · ${countAbove} por encima` : ""}
              </p>
            </div>
          );
        })}
      </div>

      <div>
        <h2 className="mb-3 text-sm font-medium text-slate-900">Por impresora</h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {printerCards.map(({ printer, rows: printerRows }) => (
            <div key={printer.id} className="rounded-2xl border border-slate-200/70 bg-white shadow-sm shadow-slate-200/50 p-4">
              <p className="font-medium text-slate-900">{printer.department.name}</p>
              <p className="mb-3 text-xs text-slate-500">
                {printer.brand} {printer.model}
              </p>
              <ConsumptionBars rows={printerRows} maxRate={maxRate} />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
