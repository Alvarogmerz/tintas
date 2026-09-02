import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { prisma } from "../db";
import { SESSION_COOKIE, getUserForSessionToken } from "./session";
import type { User } from "@prisma/client";

export async function getCurrentUser(): Promise<User | null> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  return getUserForSessionToken(prisma, token);
}

export async function requireUser(): Promise<User> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}

export async function requireAdmin(): Promise<User> {
  const user = await requireUser();
  if (user.role !== "ADMIN") redirect("/");
  return user;
}
