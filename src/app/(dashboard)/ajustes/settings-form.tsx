"use client";

import { useActionState } from "react";
import { updateSettingsAction, type SettingsFormState } from "@/lib/actions/ops";
import type { SETTING_DEFAULTS } from "@/lib/settings";

const initialState: SettingsFormState = {};

export function SettingsForm({ settings }: { settings: typeof SETTING_DEFAULTS }) {
  const [state, formAction, pending] = useActionState(updateSettingsAction, initialState);

  return (
    <form action={formAction} className="grid grid-cols-1 gap-4 rounded-2xl border border-slate-200/70 bg-white shadow-sm shadow-slate-200/50 p-4 sm:grid-cols-2">
      <Field label="Intervalo de sondeo SNMP (ms)" name="pollIntervalMs" defaultValue={settings.pollIntervalMs} />
      <Field
        label="Intervalo de sincronización Excel (ms)"
        name="excelSyncIntervalMs"
        defaultValue={settings.excelSyncIntervalMs}
      />
      <Field
        label="Umbral para PEDIR (%) — por debajo, se añade la cantidad en Excel/BD"
        name="reorderThresholdPercent"
        defaultValue={settings.reorderThresholdPercent}
      />
      <Field
        label="Umbral para avisar por email (%) — independiente del anterior"
        name="emailAlertThresholdPercent"
        defaultValue={settings.emailAlertThresholdPercent}
      />
      <Field
        label="Multiplicador desviación típica (regla de consumo)"
        name="consumptionRuleStddevMultiplier"
        defaultValue={settings.consumptionRuleStddevMultiplier}
        step="0.1"
      />
      <Field label="Cantidad máxima por pedido" name="consumptionRuleMaxQty" defaultValue={settings.consumptionRuleMaxQty} />

      <div>
        <label className="block text-xs font-medium text-slate-700">Proveedor de email</label>
        <select
          name="emailProvider"
          defaultValue={settings.emailProvider}
          className="mt-1 w-full rounded-md border border-slate-300 px-3 py-1.5 text-sm focus:border-slate-500 focus:outline-none"
        >
          <option value="none">Ninguno (solo log)</option>
          <option value="smtp">SMTP</option>
          <option value="graph">Microsoft Graph</option>
        </select>
      </div>
      <div>
        <label className="block text-xs font-medium text-slate-700">Email de aviso</label>
        <input
          name="emailTo"
          type="email"
          defaultValue={settings.emailTo}
          className="mt-1 w-full rounded-md border border-slate-300 px-3 py-1.5 text-sm focus:border-slate-500 focus:outline-none"
        />
      </div>

      <label className="flex items-center gap-2 text-sm text-slate-700 sm:col-span-2">
        <input type="checkbox" name="reorderXlAndNormal" defaultChecked={settings.reorderXlAndNormal} />
        Al pedir un color con cartucho normal y XL disponibles, pedir uno de cada
      </label>

      <div className="sm:col-span-2">
        <button
          type="submit"
          disabled={pending}
          className="rounded-lg bg-brand-800 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-60"
        >
          {pending ? "Guardando..." : "Guardar ajustes"}
        </button>
        {state.error && <p className="mt-2 text-sm text-red-600">{state.error}</p>}
        {state.success && <p className="mt-2 text-sm text-green-700">{state.success}</p>}
      </div>
    </form>
  );
}

function Field({
  label,
  name,
  defaultValue,
  step,
}: {
  label: string;
  name: string;
  defaultValue: number;
  step?: string;
}) {
  return (
    <div>
      <label className="block text-xs font-medium text-slate-700">{label}</label>
      <input
        name={name}
        type="number"
        step={step}
        defaultValue={defaultValue}
        className="mt-1 w-full rounded-md border border-slate-300 px-3 py-1.5 text-sm focus:border-slate-500 focus:outline-none"
      />
    </div>
  );
}
