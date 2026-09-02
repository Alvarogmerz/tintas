import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { importFromExcel } from "../src/lib/excel/import";

const prisma = new PrismaClient();

async function main() {
  const filePath = process.argv[2] ?? process.env.EXCEL_PATH;
  if (!filePath) {
    console.error("Uso: tsx scripts/import-excel.ts <ruta-al-excel>  (o define EXCEL_PATH en .env)");
    process.exit(1);
  }

  console.log(`Importando desde: ${filePath}`);
  const { printersImported, warnings } = await importFromExcel(prisma, filePath);

  console.log(`Impresoras detectadas: ${printersImported}`);
  if (warnings.length > 0) {
    console.log(`\nAvisos (${warnings.length}) — revisar manualmente si procede:`);
    for (const w of warnings) {
      console.log(`  fila ${w.rowIndex}, col ${w.colIndex}: ${w.message}`);
    }
  }

  console.log("\nImportación completada.");
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
