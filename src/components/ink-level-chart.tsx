"use client";

import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts";

const COLOR_HEX: Record<string, string> = {
  CYAN: "#06b6d4",
  MAGENTA: "#db2777",
  AMARILLO: "#ca8a04",
  TRICOLOR: "#7c3aed",
  NEGRO: "#334155",
};

export interface ChartPoint {
  readAt: string;
  [colorSlot: string]: string | number | null;
}

export function InkLevelChart({ data, colors }: { data: ChartPoint[]; colors: string[] }) {
  if (data.length === 0) {
    return <p className="text-sm text-slate-500">Todavía no hay lecturas de nivel de tinta.</p>;
  }

  return (
    <ResponsiveContainer width="100%" height={260}>
      <LineChart data={data} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
        <XAxis dataKey="readAt" tick={{ fontSize: 11 }} />
        <YAxis domain={[0, 100]} tick={{ fontSize: 11 }} unit="%" />
        <Tooltip />
        <Legend />
        {colors.map((color) => (
          <Line
            key={color}
            type="monotone"
            dataKey={color}
            stroke={COLOR_HEX[color] ?? "#334155"}
            dot={false}
            connectNulls
          />
        ))}
      </LineChart>
    </ResponsiveContainer>
  );
}
