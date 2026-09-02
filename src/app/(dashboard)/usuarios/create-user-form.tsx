"use client";

import { useActionState } from "react";
import { createUserAction, type UserFormState } from "@/lib/actions/users";

const initialState: UserFormState = {};

export function CreateUserForm() {
  const [state, formAction, pending] = useActionState(createUserAction, initialState);

  return (
    <form action={formAction} className="flex flex-wrap items-end gap-3 rounded-2xl border border-slate-200/70 bg-white shadow-sm shadow-slate-200/50 p-4">
      <div>
        <label className="block text-xs font-medium text-slate-700">Usuario</label>
        <input
          name="username"
          required
          className="mt-1 rounded-md border border-slate-300 px-3 py-1.5 text-sm focus:border-slate-500 focus:outline-none"
        />
      </div>
      <div>
        <label className="block text-xs font-medium text-slate-700">Contraseña</label>
        <input
          name="password"
          type="password"
          required
          className="mt-1 rounded-md border border-slate-300 px-3 py-1.5 text-sm focus:border-slate-500 focus:outline-none"
        />
      </div>
      <div>
        <label className="block text-xs font-medium text-slate-700">Rol</label>
        <select
          name="role"
          className="mt-1 rounded-md border border-slate-300 px-3 py-1.5 text-sm focus:border-slate-500 focus:outline-none"
        >
          <option value="USER">Usuario</option>
          <option value="ADMIN">Administrador</option>
        </select>
      </div>
      <button
        type="submit"
        disabled={pending}
        className="rounded-lg bg-brand-800 px-4 py-1.5 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-60"
      >
        {pending ? "Creando..." : "Crear usuario"}
      </button>
      {state.error && <p className="w-full text-sm text-red-600">{state.error}</p>}
      {state.success && <p className="w-full text-sm text-green-700">{state.success}</p>}
    </form>
  );
}
