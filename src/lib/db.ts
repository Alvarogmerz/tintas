import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient; prismaPragmasApplied?: boolean };

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}

// WAL es muchísimo más resistente que el modo por defecto (rollback journal)
// cuando hay varias escrituras seguidas o el disco es lento (este proyecto
// ha dado timeouts de SQLite en un filesystem lento) — no bloquea todo el
// fichero en cada escritura. Solo hace falta activarlo una vez por fichero
// (queda grabado en el propio .db), pero se reintenta en cada arranque por
// si acaso sin pasa nada si ya estaba activo.
if (!globalForPrisma.prismaPragmasApplied) {
  globalForPrisma.prismaPragmasApplied = true;
  // Estos PRAGMA devuelven una fila con el valor resultante, así que hace
  // falta $queryRawUnsafe (no $executeRawUnsafe, que no admite resultados).
  prisma
    .$queryRawUnsafe("PRAGMA journal_mode=WAL;")
    .then(() => prisma.$queryRawUnsafe("PRAGMA busy_timeout=10000;"))
    .catch((err) => {
      console.error("No se pudieron aplicar los PRAGMA de SQLite:", err);
    });
}
