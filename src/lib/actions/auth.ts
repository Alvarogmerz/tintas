"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { prisma } from "../db";
import { verifyPassword } from "../auth/password";
import { createSession, deleteSessionByToken, SESSION_COOKIE } from "../auth/session";

export interface LoginState {
  error?: string;
}

export async function loginAction(_prevState: LoginState, formData: FormData): Promise<LoginState> {
  const username = String(formData.get("username") ?? "").trim();
  const password = String(formData.get("password") ?? "");

  if (!username || !password) {
    return { error: "Usuario y contraseña son obligatorios." };
  }

  const user = await prisma.user.findUnique({ where: { username } });
  if (!user || !user.isActive) {
    return { error: "Usuario o contraseña incorrectos." };
  }

  const valid = await verifyPassword(password, user.passwordHash);
  if (!valid) {
    return { error: "Usuario o contraseña incorrectos." };
  }

  const { rawToken, expiresAt } = await createSession(prisma, user.id);
  const store = await cookies();
  store.set(SESSION_COOKIE, rawToken, {
    httpOnly: true,
    sameSite: "lax",
    expires: expiresAt,
    path: "/",
  });

  await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });

  redirect("/");
}

export async function logoutAction(): Promise<void> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  await deleteSessionByToken(prisma, token);
  store.delete(SESSION_COOKIE);
  redirect("/login");
}
