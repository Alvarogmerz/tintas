import type { PrismaClient } from "@prisma/client";

/**
 * Constantes ajustables desde /ajustes sin tocar código, con su valor por
 * defecto (usado si aún no existe la fila en Setting). Todo se guarda como
 * JSON en Setting.value.
 */
export const SETTING_DEFAULTS = {
  pollIntervalMs: 300_000,
  excelSyncIntervalMs: 600_000,
  // Por debajo de este % se añade la cantidad a "PEDIR" en Excel/BD.
  reorderThresholdPercent: 20,
  // Por debajo de este % (independiente del anterior) se manda el aviso por
  // email — puede ser más alto (aviso temprano) o más bajo (solo lo crítico)
  // que el umbral de pedido, según se quiera.
  emailAlertThresholdPercent: 15,
  reorderXlAndNormal: true,
  consumptionRuleStddevMultiplier: 1,
  consumptionRuleMaxQty: 3,
  emailProvider: "none" as "none" | "smtp" | "graph",
  emailTo: "tecnologia@pgoucam.com",
  // Marcas de tiempo (ISO) que el panel de ajustes usa para pedirle al worker
  // que ejecute un ciclo fuera de su intervalo normal ("sondear/sincronizar
  // ahora"). null = sin petición pendiente.
  manualPollRequestedAt: null as string | null,
  manualExcelSyncRequestedAt: null as string | null,
} satisfies Record<string, unknown>;

export type SettingKey = keyof typeof SETTING_DEFAULTS;

export async function getSetting<K extends SettingKey>(
  prisma: PrismaClient,
  key: K,
): Promise<(typeof SETTING_DEFAULTS)[K]> {
  const row = await prisma.setting.findUnique({ where: { key } });
  if (!row) return SETTING_DEFAULTS[key];
  try {
    return JSON.parse(row.value);
  } catch {
    return SETTING_DEFAULTS[key];
  }
}

export async function setSetting<K extends SettingKey>(
  prisma: PrismaClient,
  key: K,
  value: (typeof SETTING_DEFAULTS)[K],
): Promise<void> {
  await prisma.setting.upsert({
    where: { key },
    update: { value: JSON.stringify(value) },
    create: { key, value: JSON.stringify(value) },
  });
}

export async function getAllSettings(prisma: PrismaClient) {
  const keys = Object.keys(SETTING_DEFAULTS) as SettingKey[];
  const entries = await Promise.all(keys.map(async (k) => [k, await getSetting(prisma, k)] as const));
  return Object.fromEntries(entries) as typeof SETTING_DEFAULTS;
}
