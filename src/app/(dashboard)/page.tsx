import { Printer, CheckCircle2, TriangleAlert, ShoppingCart } from "lucide-react";
import { prisma } from "@/lib/db";
import { getSetting } from "@/lib/settings";
import { StatusBadge } from "@/components/status-badge";
import { PrinterCardGrid, type PrinterCardData } from "@/components/printer-card-grid";

type Tone = "ok" | "warn" | "critical" | "neutral";

function toneFor(min: number | null, threshold: number): Tone {
  if (min === null) return "neutral";
  if (min < threshold) return "critical";
  if (min < threshold * 1.5) return "warn";
  return "ok";
}

export default async function OverviewPage() {
  const [printers, pendingCount, lastCycle, threshold] = await Promise.all([
    prisma.printer.findMany({
      where: { isActive: true },
      include: {
        readings: { orderBy: { readAt: "desc" }, take: 20 },
        department: true,
      },
      orderBy: { department: { name: "asc" } },
    }),
    prisma.stockCell.count({ where: { cellType: "NUMBER" } }),
    prisma.pollCycle.findFirst({ orderBy: { startedAt: "desc" } }),
    getSetting(prisma, "reorderThresholdPercent"),
  ]);

  const cards: PrinterCardData[] = printers.map((printer) => {
    const latestByColor = new Map<string, { levelPercent: number | null; criticalAlert: boolean }>();
    for (const reading of printer.readings) {
      if (!latestByColor.has(reading.colorSlot)) {
        latestByColor.set(reading.colorSlot, { levelPercent: reading.levelPercent, criticalAlert: reading.criticalAlert });
      }
    }
    const levels = [...latestByColor.entries()].map(([colorSlot, v]) => ({
      colorSlot,
      levelPercent: v.levelPercent,
      criticalAlert: v.criticalAlert,
    }));
    const numericLevels = levels.map((l) => l.levelPercent).filter((v): v is number => v !== null);
    const anyCriticalAlert = levels.some((l) => l.criticalAlert);
    const min = numericLevels.length > 0 ? Math.min(...numericLevels) : null;
    return {
      id: printer.id,
      department: printer.department.name,
      brand: printer.brand,
      model: printer.model,
      tone: anyCriticalAlert ? "critical" : toneFor(min, threshold),
      levels,
      lastError: printer.lastError,
    };
  });

  const ok = cards.filter((c) => c.tone === "ok").length;
  const warn = cards.filter((c) => c.tone === "warn").length;
  const critical = cards.filter((c) => c.tone === "critical").length;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-lg font-semibold text-slate-900">Resumen de flota</h1>
          {lastCycle && (
            <div className="mt-1 flex items-center gap-2 text-xs text-slate-500">
              <span>Último sondeo:</span>
              <StatusBadge
                tone={lastCycle.status === "SUCCESS" ? "ok" : lastCycle.status === "PARTIAL" ? "warn" : "critical"}
              >
                {lastCycle.status}
              </StatusBadge>
              <span>{lastCycle.startedAt.toLocaleString("es-ES")}</span>
              <span>
                · {lastCycle.printersPolled} sondeadas, {lastCycle.printersFailed} fallidas
              </span>
            </div>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <StatCard icon={Printer} label="Impresoras" value={printers.length} tone="brand" />
        <StatCard icon={CheckCircle2} label="OK" value={ok} tone="ok" />
        <StatCard icon={TriangleAlert} label="Bajo / crítico" value={warn + critical} tone={critical > 0 ? "critical" : "warn"} />
        <StatCard icon={ShoppingCart} label="Pedidos pendientes" value={pendingCount} tone="accent" />
      </div>

      <p className="text-xs text-slate-400">Arrastra una tarjeta para colocarla donde quieras — se recuerda en este navegador.</p>

      <PrinterCardGrid cards={cards} threshold={threshold} />
    </div>
  );
}

function StatCard({
  icon: Icon,
  label,
  value,
  tone,
}: {
  icon: React.ComponentType<{ size?: number; strokeWidth?: number; className?: string }>;
  label: string;
  value: number;
  tone: "brand" | "accent" | "ok" | "warn" | "critical";
}) {
  const toneStyles: Record<typeof tone, string> = {
    brand: "bg-brand-50 text-brand-700",
    accent: "bg-accent-50 text-accent-700",
    ok: "bg-green-50 text-green-700",
    warn: "bg-amber-50 text-amber-700",
    critical: "bg-red-50 text-red-700",
  };

  return (
    <div className="flex items-center gap-3 rounded-2xl border border-slate-200/70 bg-white p-4 shadow-sm shadow-slate-200/50">
      <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${toneStyles[tone]}`}>
        <Icon size={20} strokeWidth={2} />
      </span>
      <div>
        <p className="text-2xl font-semibold text-slate-900">{value}</p>
        <p className="text-xs text-slate-500">{label}</p>
      </div>
    </div>
  );
}
