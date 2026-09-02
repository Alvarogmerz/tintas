import { PrismaClient } from "@prisma/client";
import { hashPassword } from "../src/lib/auth/password";

const prisma = new PrismaClient();

async function main() {
  const existing = await prisma.user.findUnique({ where: { username: "administrador" } });
  if (existing) {
    console.log("Usuario 'administrador' ya existe, no se toca.");
    return;
  }

  await prisma.user.create({
    data: {
      username: "administrador",
      passwordHash: await hashPassword("Almeria2026!"),
      role: "ADMIN",
    },
  });

  console.log("Usuario admin semilla creado: administrador / Almeria2026!");
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
