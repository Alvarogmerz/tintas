"use client";

import { useActionState, useState, useTransition } from "react";
import { toggleUserActiveAction, resetPasswordAction, type UserFormState } from "@/lib/actions/users";
import { StatusBadge } from "@/components/status-badge";

interface Props {
  id: number;
  username: string;
  role: string;
  isActive: boolean;
  isSelf: boolean;
  lastLoginAt: string | null;
}

const initialState: UserFormState = {};

export function UserRow({ id, username, role, isActive, isSelf, lastLoginAt }: Props) {
  const [showReset, setShowReset] = useState(false);
  const [pending, startTransition] = useTransition();
  const [resetState, resetAction, resetPending] = useActionState(resetPasswordAction, initialState);

  return (
    <>
      <tr>
        <td className="px-4 py-2 font-medium text-slate-900">{username}</td>
        <td className="px-4 py-2 text-slate-600">{role === "ADMIN" ? "Administrador" : "Usuario"}</td>
        <td className="px-4 py-2">
          <StatusBadge tone={isActive ? "ok" : "neutral"}>{isActive ? "Activo" : "Desactivado"}</StatusBadge>
        </td>
        <td className="px-4 py-2 text-slate-500">{lastLoginAt ?? "Nunca"}</td>
        <td className="px-4 py-2 space-x-2">
          <button
            onClick={() => setShowReset((v) => !v)}
            className="text-sm text-slate-600 hover:underline"
          >
            Restablecer contraseña
          </button>
          {!isSelf && (
            <button
              disabled={pending}
              onClick={() => startTransition(() => toggleUserActiveAction(id))}
              className="text-sm text-slate-600 hover:underline disabled:opacity-60"
            >
              {isActive ? "Desactivar" : "Activar"}
            </button>
          )}
        </td>
      </tr>
      {showReset && (
        <tr>
          <td colSpan={5} className="bg-slate-50 px-4 py-3">
            <form action={resetAction} className="flex items-end gap-3">
              <input type="hidden" name="userId" value={id} />
              <div>
                <label className="block text-xs font-medium text-slate-700">Nueva contraseña</label>
                <input
                  name="password"
                  type="password"
                  required
                  className="mt-1 rounded-md border border-slate-300 px-3 py-1.5 text-sm focus:border-slate-500 focus:outline-none"
                />
              </div>
              <button
                type="submit"
                disabled={resetPending}
                className="rounded-lg bg-brand-800 px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-60"
              >
                Guardar
              </button>
              {resetState.error && <p className="text-sm text-red-600">{resetState.error}</p>}
              {resetState.success && <p className="text-sm text-green-700">{resetState.success}</p>}
            </form>
          </td>
        </tr>
      )}
    </>
  );
}
