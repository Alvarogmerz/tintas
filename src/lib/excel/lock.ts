import path from "node:path";
import fs from "node:fs/promises";

/** Ruta del fichero de bloqueo que Excel crea mientras alguien tiene el libro abierto. */
export function lockFilePathFor(excelPath: string): string {
  const dir = path.dirname(excelPath);
  const base = path.basename(excelPath);
  return path.join(dir, `~$${base}`);
}

export async function isExcelLockedByEditor(excelPath: string): Promise<boolean> {
  try {
    await fs.access(lockFilePathFor(excelPath));
    return true;
  } catch {
    return false;
  }
}
