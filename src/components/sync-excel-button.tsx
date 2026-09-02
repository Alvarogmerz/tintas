"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { syncStockWithExcelAction } from "@/lib/actions/stock";

export function SyncExcelButton() {
  const [result, setResult] = useState<{ message: string; isWarning: boolean } | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function handleClick() {
    startTransition(async () => {
      const outcome = await syncStockWithExcelAction();
      setResult(outcome);
      router.refresh();
    });
  }

  return (
    <div className="flex items-center gap-3">
      <button
        onClick={handleClick}
        disabled={pending}
        className="rounded-lg bg-brand-800 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-60"
      >
        {pending ? "Guardando..." : "Guardar (comparar y sincronizar con el Excel)"}
      </button>
      {result && (
        <span className={`text-sm ${result.isWarning ? "text-amber-600" : "text-green-700"}`}>{result.message}</span>
      )}
    </div>
  );
}
