"use client";

import { useActionState } from "react";
import { updatePrinterAction, type UpdatePrinterResult } from "@/lib/actions/printers";

const initialState: UpdatePrinterResult = {};

export function EditPrinterForm({
  printerId,
  ip,
  brand,
  model,
  snmpCommunity,
  snmpVersion,
  snmpPort,
  isActive,
}: {
  printerId: number;
  ip: string | null;
  brand: string;
  model: string;
  snmpCommunity: string;
  snmpVersion: string;
  snmpPort: number;
  isActive: boolean;
}) {
  const [state, formAction, pending] = useActionState(updatePrinterAction, initialState);

  return (
    <form action={formAction} className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <input type="hidden" name="printerId" value={printerId} />

      <div>
        <label className="block text-xs font-medium text-slate-700">IP</label>
        <input
          name="ip"
          defaultValue={ip ?? ""}
          placeholder="10.0.170.99"
          className="mt-1 w-full rounded-md border border-slate-300 px-3 py-1.5 text-sm focus:border-slate-500 focus:outline-none"
        />
      </div>
      <div>
        <label className="block text-xs font-medium text-slate-700">Marca</label>
        <select
          name="brand"
          defaultValue={brand}
          className="mt-1 w-full rounded-md border border-slate-300 px-3 py-1.5 text-sm focus:border-slate-500 focus:outline-none"
        >
          <option value="EPSON">EPSON</option>
          <option value="BROTHER">BROTHER</option>
          <option value="HP">HP</option>
          <option value="OTHER">OTRA</option>
        </select>
      </div>
      <div>
        <label className="block text-xs font-medium text-slate-700">Modelo</label>
        <input
          name="model"
          defaultValue={model}
          className="mt-1 w-full rounded-md border border-slate-300 px-3 py-1.5 text-sm focus:border-slate-500 focus:outline-none"
        />
      </div>
      <label className="flex items-end gap-2 pb-2 text-sm text-slate-700">
        <input type="checkbox" name="isActive" defaultChecked={isActive} />
        Activa (se sondea)
      </label>

      <div>
        <label className="block text-xs font-medium text-slate-700">Comunidad SNMP</label>
        <input
          name="snmpCommunity"
          defaultValue={snmpCommunity}
          className="mt-1 w-full rounded-md border border-slate-300 px-3 py-1.5 text-sm focus:border-slate-500 focus:outline-none"
        />
      </div>
      <div>
        <label className="block text-xs font-medium text-slate-700">Versión SNMP</label>
        <select
          name="snmpVersion"
          defaultValue={snmpVersion}
          className="mt-1 w-full rounded-md border border-slate-300 px-3 py-1.5 text-sm focus:border-slate-500 focus:outline-none"
        >
          <option value="2c">2c</option>
          <option value="1">1</option>
        </select>
      </div>
      <div>
        <label className="block text-xs font-medium text-slate-700">Puerto SNMP</label>
        <input
          name="snmpPort"
          type="number"
          defaultValue={snmpPort}
          className="mt-1 w-full rounded-md border border-slate-300 px-3 py-1.5 text-sm focus:border-slate-500 focus:outline-none"
        />
      </div>

      <div className="flex items-end sm:col-span-2 lg:col-span-4">
        <button
          type="submit"
          disabled={pending}
          className="rounded-lg bg-brand-800 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-60"
        >
          {pending ? "Guardando..." : "Guardar configuración"}
        </button>
        {state.error && <span className="ml-3 text-sm text-red-600">{state.error}</span>}
        {!state.error && state.warning && <span className="ml-3 text-sm text-amber-600">{state.warning}</span>}
        {!state.error && !state.warning && state.success && (
          <span className="ml-3 text-sm text-green-700">{state.success}</span>
        )}
      </div>
    </form>
  );
}
