"use client";

import { useState, useTransition } from "react";
import { updateStockCellAction, updateStockOnHandAction, type UpdateStockCellResult } from "@/lib/actions/stock";

interface Props {
  cellId: number;
  cellType: "BLANK" | "NUMBER" | "X";
  /** "pedir" edita pendingQty (bloque PEDIR); "stock" edita stockOnHand (bloque STOCK). */
  variant?: "pedir" | "stock";
  value: number | null;
}

export function StockCellEditor({ cellId, cellType, variant = "pedir", value: initialValue }: Props) {
  const [value, setValue] = useState(initialValue !== null && initialValue !== 0 ? String(initialValue) : "");
  const [error, setError] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  if (cellType === "X") {
    return <span className="inline-block w-16 rounded bg-slate-100 px-2 py-1 text-center text-sm text-slate-400">X</span>;
  }

  function save() {
    startTransition(async () => {
      const action = variant === "pedir" ? updateStockCellAction : updateStockOnHandAction;
      const result: UpdateStockCellResult = await action(cellId, value);
      setError(result.error ?? null);
      setWarning(result.warning ?? null);
    });
  }

  const highlighted = variant === "pedir" && cellType === "NUMBER";

  return (
    <div className="inline-flex flex-col items-start">
      <input
        type="text"
        inputMode="numeric"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onBlur={save}
        onKeyDown={(e) => {
          if (e.key === "Enter") e.currentTarget.blur();
        }}
        disabled={pending}
        placeholder="—"
        className={`w-16 rounded border px-2 py-1 text-center text-sm ${
          highlighted ? "border-amber-300 bg-amber-50" : "border-slate-300 bg-white"
        } focus:border-slate-500 focus:outline-none disabled:opacity-60`}
      />
      {error && <span className="mt-0.5 max-w-40 text-xs text-red-600">{error}</span>}
      {!error && warning && <span className="mt-0.5 max-w-40 text-xs text-amber-600">{warning}</span>}
    </div>
  );
}
