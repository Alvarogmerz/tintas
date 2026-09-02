"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { testPrinterConnectionAction } from "@/lib/actions/printers";

const COLOR_LABEL: Record<string, string> = {
  CYAN: "Cian",
  MAGENTA: "Magenta",
  AMARILLO: "Amarillo",
  TRICOLOR: "Tricolor",
  NEGRO: "Negro",
};

export function TestConnectionButton({ printerId }: { printerId: number }) {
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<Awaited<ReturnType<typeof testPrinterConnectionAction>> | null>(null);
  const router = useRouter();

  function run() {
    startTransition(async () => {
      const r = await testPrinterConnectionAction(printerId);
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
        {pending ? "Probando..." : "Probar conexión ahora"}
      </button>

      {result && !pending && (
        <div className="mt-2 text-sm">
          {result.ok ? (
            <div className="text-green-700">
              ✓ Conectó correctamente.
              {result.readings && result.readings.length > 0 && (
                <ul className="mt-1 list-inside list-disc text-slate-600">
                  {result.readings.map((r) => (
                    <li key={r.colorSlot}>
                      {COLOR_LABEL[r.colorSlot] ?? r.colorSlot}:{" "}
                      {r.criticalAlert ? "SIN TÓNER" : r.levelPercent !== null ? `${r.levelPercent}%` : "n/d"}
                    </li>
                  ))}
                </ul>
              )}
              {result.readings && result.readings.length === 0 && (
                <p className="mt-1 text-slate-500">Conectó, pero no se reconoció ningún consumible.</p>
              )}
            </div>
          ) : (
            <p className="text-red-600">✗ No se pudo conectar: {result.error}</p>
          )}
        </div>
      )}
    </div>
  );
}
