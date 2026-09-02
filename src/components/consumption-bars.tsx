const COLOR_STYLES: Record<string, string> = {
  CYAN: "bg-cyan-500",
  MAGENTA: "bg-pink-600",
  AMARILLO: "bg-amber-400",
  TRICOLOR: "bg-violet-500",
  NEGRO: "bg-slate-700",
};

export interface ConsumptionRow {
  colorSlot: string;
  ratePctPerDay: number | null;
  aboveAverage: boolean;
}

export function ConsumptionBars({ rows, maxRate }: { rows: ConsumptionRow[]; maxRate: number }) {
  return (
    <div className="space-y-1.5">
      {rows.map((row) => {
        const widthPct = row.ratePctPerDay !== null && maxRate > 0 ? Math.min(100, (row.ratePctPerDay / maxRate) * 100) : 0;
        return (
          <div key={row.colorSlot} className="flex items-center gap-2">
            <span className="w-4 shrink-0 text-center text-[10px] font-semibold text-slate-500">
              {row.colorSlot[0]}
            </span>
            <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-slate-100">
              {row.ratePctPerDay !== null && (
                <div
                  className={`h-full rounded-full ${row.aboveAverage ? "bg-red-500" : (COLOR_STYLES[row.colorSlot] ?? "bg-slate-400")}`}
                  style={{ width: `${Math.max(widthPct, 4)}%` }}
                />
              )}
            </div>
            <span className={`w-14 shrink-0 text-right text-xs ${row.aboveAverage ? "font-semibold text-red-600" : "text-slate-500"}`}>
              {row.ratePctPerDay !== null ? `${row.ratePctPerDay.toFixed(1)}%/d` : "—"}
            </span>
          </div>
        );
      })}
    </div>
  );
}
