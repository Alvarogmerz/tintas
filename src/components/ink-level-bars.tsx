const COLOR_STYLES: Record<string, { bar: string; label: string }> = {
  CYAN: { bar: "bg-cyan-500", label: "C" },
  MAGENTA: { bar: "bg-pink-600", label: "M" },
  AMARILLO: { bar: "bg-amber-400", label: "A" },
  TRICOLOR: { bar: "bg-violet-500", label: "T" },
  NEGRO: { bar: "bg-slate-700", label: "N" },
};

export interface InkLevel {
  colorSlot: string;
  levelPercent: number | null;
  criticalAlert?: boolean;
}

export function InkLevelBars({ levels, threshold }: { levels: InkLevel[]; threshold: number }) {
  if (levels.length === 0) {
    return <p className="text-xs text-slate-400">Sin lecturas todavía</p>;
  }

  return (
    <div className="space-y-1.5">
      {levels.map(({ colorSlot, levelPercent, criticalAlert }) => {
        const style = COLOR_STYLES[colorSlot] ?? { bar: "bg-slate-400", label: colorSlot[0] };
        const low = levelPercent !== null && levelPercent < threshold;
        return (
          <div key={colorSlot} className="flex items-center gap-2">
            <span className="w-4 shrink-0 text-center text-[10px] font-semibold text-slate-500">{style.label}</span>
            {criticalAlert ? (
              <span className="flex-1 rounded bg-red-100 px-1.5 py-0.5 text-center text-[10px] font-semibold text-red-700">
                SIN TÓNER — pedido añadido
              </span>
            ) : (
              <>
                <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-slate-100">
                  {levelPercent !== null && (
                    <div
                      className={`h-full rounded-full ${low ? "bg-red-500" : style.bar}`}
                      style={{ width: `${Math.max(levelPercent, 3)}%` }}
                    />
                  )}
                </div>
                <span className={`w-9 shrink-0 text-right text-xs ${low ? "font-semibold text-red-600" : "text-slate-500"}`}>
                  {levelPercent !== null ? `${levelPercent}%` : "—"}
                </span>
              </>
            )}
          </div>
        );
      })}
    </div>
  );
}
