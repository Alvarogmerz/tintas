"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { restoreExcelBackupAction } from "@/lib/actions/ops";

export function RestoreBackupButton() {
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<Awaited<ReturnType<typeof restoreExcelBackupAction>> | null>(null);
  const router = useRouter();

  function run() {
    startTransition(async () => {
      const r = await restoreExcelBackupAction();
      setResult(r);
      router.refresh();
    });
  }

  return (
    <div>
      <button
        onClick={run}
        disabled={pending}
        className="rounded-md bg-red-700 px-4 py-2 text-sm font-medium text-white hover:bg-red-800 disabled:opacity-60"
      >
        {pending ? "Restaurando..." : "Restaurar desde la última copia"}
      </button>
      {result && !pending && (
        <p className={`mt-2 text-sm ${result.error ? "text-red-600" : "text-green-700"}`}>
          {result.error ?? result.message}
        </p>
      )}
    </div>
  );
}
