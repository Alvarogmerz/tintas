import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/auth/guards";
import { CreateUserForm } from "./create-user-form";
import { UserRow } from "./user-row";

export default async function UsersPage() {
  const admin = await requireAdmin();
  const users = await prisma.user.findMany({ orderBy: { username: "asc" } });

  return (
    <div className="space-y-4">
      <h1 className="text-lg font-semibold text-slate-900">Usuarios</h1>

      <CreateUserForm />

      <div className="overflow-hidden rounded-2xl border border-slate-200/70 bg-white shadow-sm shadow-slate-200/50">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
            <tr>
              <th className="px-4 py-2">Usuario</th>
              <th className="px-4 py-2">Rol</th>
              <th className="px-4 py-2">Estado</th>
              <th className="px-4 py-2">Último acceso</th>
              <th className="px-4 py-2">Acciones</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {users.map((u) => (
              <UserRow
                key={u.id}
                id={u.id}
                username={u.username}
                role={u.role}
                isActive={u.isActive}
                isSelf={u.id === admin.id}
                lastLoginAt={u.lastLoginAt ? u.lastLoginAt.toLocaleString("es-ES") : null}
              />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
