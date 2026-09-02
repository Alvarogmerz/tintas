"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { reimportFromExcelAction } from "@/lib/actions/ops";

export function ReimportButton() {
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<Awaited<ReturnType<typeof reimportFromExcelAction>> | null>(null);
  const router = useRouter();

  function run() {
    startTransition(async () => {
      const r = await reimportFromExcelAction();
      setResult(r);
      router.refresh();
    });
  }

  return (
    <div>
      <button
        onClick={run}
        disabled={pending}
        className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60"
      >
        {pending ? "Importando..." : "Reimportar impresoras del Excel"}
      </button>
      {result && !pending && (
        <div className="mt-2 text-sm">
          {result.error && <p className="text-red-600">{result.error}</p>}
          {result.message && <p className="text-green-700">{result.message}</p>}
          {result.warnings && result.warnings.length > 0 && (
            <ul className="mt-1 list-inside list-disc text-amber-600">
              {result.warnings.map((w, i) => (
                <li key={i}>{w}</li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
