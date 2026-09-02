"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "../db";
import { requireAdmin } from "../auth/guards";
import { getAllSettings, setSetting } from "../settings";
import { importFromExcel } from "../excel/import";
import { restoreLatestBackup } from "../excel/backup";
import { syncExcelNow } from "../excel/sync";

export async function requestManualPollAction(): Promise<void> {
  await requireAdmin();
  await setSetting(prisma, "manualPollRequestedAt", new Date().toISOString());
  revalidatePath("/ajustes");
}

export interface ReimportResult {
  error?: string;
  message?: string;
  warnings?: string[];
}

/**
 * Re-lee el Excel real y da de alta (o actualiza) departamentos, impresoras,
 * filas de cartucho y celdas STOCK/PEDIR — es como se añade una impresora
 * nueva: se rellena su fila en el Excel con el mismo formato que las demás,
 * se guarda, y se pulsa este botón (o se espera al siguiente ciclo, que
 * también lo hace... en realidad no: el ciclo normal solo sincroniza STOCK/
 * PEDIR de lo que ya existe, no da de alta impresoras nuevas — por eso hace
 * falta este botón para eso en concreto).
 */
export async function reimportFromExcelAction(): Promise<ReimportResult> {
  await requireAdmin();

  const excelPath = process.env.EXCEL_PATH;
  if (!excelPath) return { error: "EXCEL_PATH no está configurado en este entorno." };

  try {
    const result = await importFromExcel(prisma, excelPath);
    revalidatePath("/impresoras");
    revalidatePath("/departamentos");
    revalidatePath("/pedidos");
    revalidatePath("/");
    return {
      message: `${result.printersImported} impresora(s) leídas del Excel.`,
      warnings: result.warnings.map((w) => `fila ${w.rowIndex}: ${w.message}`),
    };
  } catch (err) {
    return { error: `No se pudo importar: ${(err as Error).message}` };
  }
}

export async function requestManualExcelSyncAction(): Promise<void> {
  await requireAdmin();
  await setSetting(prisma, "manualExcelSyncRequestedAt", new Date().toISOString());
  revalidatePath("/ajustes");
}

export interface SettingsFormState {
  error?: string;
  success?: string;
}

export async function updateSettingsAction(
  _prev: SettingsFormState,
  formData: FormData,
): Promise<SettingsFormState> {
  await requireAdmin();

  const pollIntervalMs = Number(formData.get("pollIntervalMs"));
  const excelSyncIntervalMs = Number(formData.get("excelSyncIntervalMs"));
  const reorderThresholdPercent = Number(formData.get("reorderThresholdPercent"));
  const emailAlertThresholdPercent = Number(formData.get("emailAlertThresholdPercent"));
  const consumptionRuleStddevMultiplier = Number(formData.get("consumptionRuleStddevMultiplier"));
  const consumptionRuleMaxQty = Number(formData.get("consumptionRuleMaxQty"));
  const reorderXlAndNormal = formData.get("reorderXlAndNormal") === "on";
  const emailProvider = String(formData.get("emailProvider") ?? "none") as "none" | "smtp" | "graph";
  const emailTo = String(formData.get("emailTo") ?? "").trim();

  if (
    ![
      pollIntervalMs,
      excelSyncIntervalMs,
      reorderThresholdPercent,
      emailAlertThresholdPercent,
      consumptionRuleStddevMultiplier,
      consumptionRuleMaxQty,
    ].every((n) => Number.isFinite(n) && n >= 0)
  ) {
    return { error: "Todos los valores numéricos deben ser válidos y no negativos." };
  }
  if (!emailTo.includes("@")) {
    return { error: "El email de aviso no parece válido." };
  }

  await Promise.all([
    setSetting(prisma, "pollIntervalMs", pollIntervalMs),
    setSetting(prisma, "excelSyncIntervalMs", excelSyncIntervalMs),
    setSetting(prisma, "reorderThresholdPercent", reorderThresholdPercent),
    setSetting(prisma, "emailAlertThresholdPercent", emailAlertThresholdPercent),
    setSetting(prisma, "consumptionRuleStddevMultiplier", consumptionRuleStddevMultiplier),
    setSetting(prisma, "consumptionRuleMaxQty", consumptionRuleMaxQty),
    setSetting(prisma, "reorderXlAndNormal", reorderXlAndNormal),
    setSetting(prisma, "emailProvider", emailProvider),
    setSetting(prisma, "emailTo", emailTo),
  ]);

  revalidatePath("/ajustes");
  return { success: "Ajustes guardados." };
}

export interface RestoreBackupResult {
  error?: string;
  message?: string;
}

/**
 * Para cuando alguien borra el Excel real: restaura la copia de seguridad
 * más reciente en la misma ruta configurada, y a continuación sincroniza
 * para que se vuelquen ahí los cambios de STOCK/PEDIR que haya habido en la
 * app desde que se hizo esa copia.
 */
export async function restoreExcelBackupAction(): Promise<RestoreBackupResult> {
  await requireAdmin();

  const excelPath = process.env.EXCEL_PATH;
  if (!excelPath) return { error: "EXCEL_PATH no está configurado en este entorno." };

  const restore = await restoreLatestBackup(excelPath);
  if (!restore.ok) {
    return { error: restore.error };
  }

  const syncResult = await syncExcelNow(prisma);
  revalidatePath("/ajustes");
  revalidatePath("/impresoras");
  revalidatePath("/pedidos");
  revalidatePath("/");

  const syncNote =
    syncResult.status === "SUCCESS"
      ? ` Se han volcado ${syncResult.cellsWritten} cambio(s) pendiente(s) desde entonces.`
      : "";
  return { message: `Restaurado desde "${restore.restoredFrom}".${syncNote}` };
}

export async function getSettingsSnapshot() {
  await requireAdmin();
  return getAllSettings(prisma);
}
