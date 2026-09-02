const STYLES: Record<string, { badge: string; dot: string }> = {
  ok: { badge: "bg-green-50 text-green-700 ring-1 ring-inset ring-green-600/20", dot: "bg-green-500" },
  warn: { badge: "bg-amber-50 text-amber-700 ring-1 ring-inset ring-amber-600/20", dot: "bg-amber-500" },
  critical: { badge: "bg-red-50 text-red-700 ring-1 ring-inset ring-red-600/20", dot: "bg-red-500" },
  neutral: { badge: "bg-slate-100 text-slate-600 ring-1 ring-inset ring-slate-500/10", dot: "bg-slate-400" },
};

export function StatusBadge({
  tone,
  children,
}: {
  tone: "ok" | "warn" | "critical" | "neutral";
  children: React.ReactNode;
}) {
  const style = STYLES[tone];
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ${style.badge}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${style.dot}`} />
      {children}
    </span>
  );
}
