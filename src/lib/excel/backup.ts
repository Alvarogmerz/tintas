import fs from "node:fs/promises";
import path from "node:path";

// Se guardan en el almacenamiento propio del servidor (junto a la base de
// datos), no en la misma carpeta que el Excel real: así una copia de
// seguridad sobrevive aunque alguien borre la carpeta entera del recurso
// compartido, no solo el archivo.
const BACKUP_DIR = path.join(process.cwd(), "data", "excel-backups");
const MAX_BACKUPS = 30;
const MIN_BACKUP_INTERVAL_MS = 60 * 60 * 1000; // no más de una copia por hora

export interface BackupInfo {
  name: string;
  mtime: Date;
  sizeBytes: number;
}

export async function listBackups(): Promise<BackupInfo[]> {
  try {
    const files = await fs.readdir(BACKUP_DIR);
    const stats = await Promise.all(
      files
        .filter((f) => f.endsWith(".xlsx"))
        .map(async (f) => {
          const st = await fs.stat(path.join(BACKUP_DIR, f));
          return { name: f, mtime: st.mtime, sizeBytes: st.size };
        }),
    );
    return stats.sort((a, b) => b.mtime.getTime() - a.mtime.getTime());
  } catch {
    return [];
  }
}

/**
 * Copia el Excel real tal cual (bytes íntegros, sin pasar por ExcelJS, para
 * no arriesgar perder nada de formato) a un almacén de copias de seguridad
 * propio. Como máximo una copia por hora — se llama en cada sincronización,
 * pero no hace falta guardar una nueva si la última es reciente.
 */
export async function backupExcelFile(excelPath: string): Promise<void> {
  try {
    await fs.mkdir(BACKUP_DIR, { recursive: true });

    const existing = await listBackups();
    if (existing.length > 0 && Date.now() - existing[0].mtime.getTime() < MIN_BACKUP_INTERVAL_MS) {
      return;
    }

    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const backupPath = path.join(BACKUP_DIR, `TintaImpresoras-${timestamp}.xlsx`);
    await fs.copyFile(excelPath, backupPath);

    const all = await listBackups();
    const excess = all.length - MAX_BACKUPS;
    if (excess > 0) {
      for (const old of all.slice(-excess)) {
        await fs.rm(path.join(BACKUP_DIR, old.name)).catch(() => {});
      }
    }
  } catch (err) {
    console.error("No se pudo hacer copia de seguridad del Excel:", err);
  }
}

export interface RestoreResult {
  ok: boolean;
  error?: string;
  restoredFrom?: string;
}

/** Restaura la copia más reciente en la ruta configurada del Excel real. */
export async function restoreLatestBackup(excelPath: string): Promise<RestoreResult> {
  const backups = await listBackups();
  if (backups.length === 0) {
    return { ok: false, error: "No hay ninguna copia de seguridad todavía." };
  }
  const latest = backups[0];
  try {
    await fs.mkdir(path.dirname(excelPath), { recursive: true });
    await fs.copyFile(path.join(BACKUP_DIR, latest.name), excelPath);
    return { ok: true, restoredFrom: latest.name };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}

/** true si el Excel configurado no existe en disco ahora mismo. */
export async function excelFileMissing(excelPath: string): Promise<boolean> {
  try {
    await fs.access(excelPath);
    return false;
  } catch {
    return true;
  }
}
