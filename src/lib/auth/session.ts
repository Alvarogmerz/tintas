import crypto from "node:crypto";
import type { PrismaClient, User } from "@prisma/client";

export const SESSION_COOKIE = "tintas_session";
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 días

function hashToken(rawToken: string): string {
  return crypto.createHash("sha256").update(rawToken).digest("hex");
}

/** Crea una sesión y devuelve el token en crudo (el que va en la cookie). */
export async function createSession(prisma: PrismaClient, userId: number): Promise<{ rawToken: string; expiresAt: Date }> {
  const rawToken = crypto.randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
  await prisma.session.create({
    data: { userId, tokenHash: hashToken(rawToken), expiresAt },
  });
  return { rawToken, expiresAt };
}

export async function getUserForSessionToken(prisma: PrismaClient, rawToken: string | undefined): Promise<User | null> {
  if (!rawToken) return null;
  const tokenHash = hashToken(rawToken);
  const session = await prisma.session.findUnique({ where: { tokenHash }, include: { user: true } });
  if (!session) return null;
  if (session.expiresAt < new Date()) {
    await prisma.session.delete({ where: { id: session.id } }).catch(() => {});
    return null;
  }
  if (!session.user.isActive) return null;
  return session.user;
}

export async function deleteSessionByToken(prisma: PrismaClient, rawToken: string | undefined): Promise<void> {
  if (!rawToken) return;
  await prisma.session.deleteMany({ where: { tokenHash: hashToken(rawToken) } });
}
