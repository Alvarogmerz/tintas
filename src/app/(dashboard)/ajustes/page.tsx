import { prisma } from "@/lib/db";
import { getAllSettings } from "@/lib/settings";
import { requireAdmin } from "@/lib/auth/guards";
import { excelFileMissing, listBackups } from "@/lib/excel/backup";
import { StatusBadge } from "@/components/status-badge";
import { SettingsForm } from "./settings-form";
import { ManualTriggerButtons } from "./manual-trigger-buttons";
import { ReimportButton } from "./reimport-button";
import { RestoreBackupButton } from "./restore-backup-button";

export default async function AjustesPage() {
  await requireAdmin();

  const excelPath = process.env.EXCEL_PATH;
  const [settings, syncLogs, missing, backups] = await Promise.all([
    getAllSettings(prisma),
    prisma.excelSyncLog.findMany({ orderBy: { startedAt: "desc" }, take: 5 }),
    excelPath ? excelFileMissing(excelPath) : Promise.resolve(false),
    listBackups(),
  ]);

  return (
    <div className="space-y-6">
      <h1 className="text-lg font-semibold text-slate-900">Ajustes</h1>

      {missing && (
        <div className="rounded-xl border-2 border-red-300 bg-red-50 p-4">
          <h2 className="text-sm font-bold text-red-800">⚠ No se encuentra el archivo Excel</h2>
          <p className="mt-1 text-sm text-red-700">
            No hay ningún archivo en la ruta configurada (<code>{excelPath}</code>) — puede que alguien lo haya
            borrado o movido. La app sigue funcionando con la base de datos, pero nada se refleja en el Excel hasta
            que vuelva a existir ahí.
          </p>
          {backups.length > 0 ? (
            <div className="mt-3">
              <p className="text-sm text-red-700">
                Hay {backups.length} copia(s) de seguridad guardadas — la más reciente es de{" "}
                {backups[0].mtime.toLocaleString("es-ES")}.
              </p>
              <div className="mt-2">
                <RestoreBackupButton />
              </div>
            </div>
          ) : (
            <p className="mt-3 text-sm text-red-700">
              Todavía no hay ninguna copia de seguridad guardada — habrá que volver a colocar el archivo a mano en
              esa ruta (con el mismo formato: cabeceras STOCK/PEDIR, columnas, etc.) antes de que la app pueda
              seguir sincronizando.
            </p>
          )}
        </div>
      )}

      <SettingsForm settings={settings} />

      <div className="space-y-3 rounded-2xl border border-slate-200/70 bg-white shadow-sm shadow-slate-200/50 p-4">
        <h2 className="text-sm font-medium text-slate-900">Acciones manuales</h2>
        <ManualTriggerButtons />
        <p className="text-xs text-slate-500">
          El worker las recoge en un máximo de ~5 segundos, dentro de su ciclo normal.
        </p>
      </div>

      <div className="rounded-2xl border border-slate-200/70 bg-white shadow-sm shadow-slate-200/50 p-4">
        <h2 className="text-sm font-medium text-slate-900">Añadir o dar de alta impresoras</h2>
        <p className="mt-1 text-xs text-slate-500">
          Para añadir una impresora nueva: copia la fila (o las dos filas, si tiene cartucho normal y XL) de otra
          impresora ya existente en el Excel real, pega debajo, y rellena departamento, IP, marca, modelo y los SKUs
          de cartucho. Guarda, cierra el Excel, y pulsa este botón para darla de alta en la aplicación.
        </p>
        <div className="mt-3">
          <ReimportButton />
        </div>
      </div>

      {!missing && (
        <div className="rounded-2xl border border-slate-200/70 bg-white shadow-sm shadow-slate-200/50 p-4">
          <h2 className="text-sm font-medium text-slate-900">Copias de seguridad del Excel</h2>
          {backups.length > 0 ? (
            <p className="mt-1 text-sm text-slate-600">
              {backups.length} copia(s) guardadas. Última: {backups[0].mtime.toLocaleString("es-ES")}. Se guarda una
              nueva como máximo cada hora, y se conservan las últimas 30.
            </p>
          ) : (
            <p className="mt-1 text-sm text-slate-500">
              Todavía no hay ninguna — se creará la primera en la próxima sincronización.
            </p>
          )}
        </div>
      )}

      <div className="rounded-2xl border border-slate-200/70 bg-white shadow-sm shadow-slate-200/50 p-4">
        <h2 className="mb-2 text-sm font-medium text-slate-900">
          Estado del acceso al Excel (recurso compartido montado en el servidor)
        </h2>
        <table className="w-full text-sm">
          <thead className="text-left text-xs uppercase text-slate-500">
            <tr>
              <th className="py-1">Fecha</th>
              <th className="py-1">Estado</th>
              <th className="py-1">Celdas escritas</th>
              <th className="py-1">Detalle</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {syncLogs.map((log) => (
              <tr key={log.id}>
                <td className="py-1 text-slate-600">{log.startedAt.toLocaleString("es-ES")}</td>
                <td className="py-1">
                  <StatusBadge tone={log.status === "SUCCESS" ? "ok" : log.status === "DEFERRED_LOCKED" ? "warn" : "critical"}>
                    {log.status}
                  </StatusBadge>
                </td>
                <td className="py-1 text-slate-600">{log.cellsWritten}</td>
                <td className="py-1 text-slate-500">{log.errorMessage ?? "—"}</td>
              </tr>
            ))}
            {syncLogs.length === 0 && (
              <tr>
                <td colSpan={4} className="py-4 text-center text-slate-400">
                  Todavía no hay sincronizaciones registradas.
                </td>
              </tr>
            )}
          </tbody>
        </table>
        <p className="mt-2 text-xs text-slate-500">
          Si ves &quot;DEFERRED_LOCKED&quot; repetido, alguien tiene el Excel abierto. Si ves &quot;FAILED&quot; con un
          error de acceso a fichero, probablemente el montaje del recurso compartido se ha caído en el servidor.
        </p>
      </div>
    </div>
  );
}
