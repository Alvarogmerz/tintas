"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "../db";
import { requireAdmin } from "../auth/guards";
import { hashPassword } from "../auth/password";

export interface UserFormState {
  error?: string;
  success?: string;
}

export async function createUserAction(_prev: UserFormState, formData: FormData): Promise<UserFormState> {
  await requireAdmin();

  const username = String(formData.get("username") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const role = formData.get("role") === "ADMIN" ? "ADMIN" : "USER";

  if (!/^[a-zA-Z0-9._-]{3,32}$/.test(username)) {
    return { error: "El usuario debe tener 3-32 caracteres (letras, números, punto, guion o guion bajo)." };
  }
  if (password.length < 8) {
    return { error: "La contraseña debe tener al menos 8 caracteres." };
  }

  const existing = await prisma.user.findUnique({ where: { username } });
  if (existing) return { error: "Ese nombre de usuario ya existe." };

  await prisma.user.create({
    data: { username, passwordHash: await hashPassword(password), role },
  });

  revalidatePath("/usuarios");
  return { success: `Usuario "${username}" creado.` };
}

export async function toggleUserActiveAction(userId: number): Promise<void> {
  const admin = await requireAdmin();
  if (admin.id === userId) return; // no desactivarse a uno mismo

  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) return;
  await prisma.user.update({ where: { id: userId }, data: { isActive: !user.isActive } });
  revalidatePath("/usuarios");
}

export async function resetPasswordAction(_prev: UserFormState, formData: FormData): Promise<UserFormState> {
  await requireAdmin();

  const userId = Number(formData.get("userId"));
  const password = String(formData.get("password") ?? "");
  if (password.length < 8) {
    return { error: "La contraseña debe tener al menos 8 caracteres." };
  }

  await prisma.user.update({ where: { id: userId }, data: { passwordHash: await hashPassword(password) } });
  revalidatePath("/usuarios");
  return { success: "Contraseña actualizada." };
}
