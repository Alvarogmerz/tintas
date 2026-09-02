"use client";

import { useTransition } from "react";
import { requestManualPollAction, requestManualExcelSyncAction } from "@/lib/actions/ops";

export function ManualTriggerButtons() {
  const [pollPending, startPoll] = useTransition();
  const [syncPending, startSync] = useTransition();

  return (
    <div className="flex gap-3">
      <button
        onClick={() => startPoll(() => requestManualPollAction())}
        disabled={pollPending}
        className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60"
      >
        {pollPending ? "Solicitado..." : "Sondear impresoras ahora"}
      </button>
      <button
        onClick={() => startSync(() => requestManualExcelSyncAction())}
        disabled={syncPending}
        className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60"
      >
        {syncPending ? "Solicitado..." : "Sincronizar Excel ahora"}
      </button>
    </div>
  );
}
