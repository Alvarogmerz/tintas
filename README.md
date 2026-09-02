# Tintas Auto

Gestión y pedido automático de tinta/tóner para las impresoras de PGO/UCAM/DEA/FPO:
sondeo SNMP de niveles de tinta, cálculo de cantidad a pedir por consumo histórico,
sincronización con `TintaImpresoras.xlsx`, aviso por email y panel web de gestión.

## Despliegue en producción

Ver [INSTALL.md](./INSTALL.md) — instalación en un solo comando sobre Ubuntu Server + Docker.

## Desarrollo local

```bash
pnpm install
cp .env.example .env   # ajusta DATABASE_URL, p.ej. file:../data/tintas.db
pnpm db:migrate
pnpm db:seed            # crea el usuario admin: administrador / Almeria2026!
pnpm dev                # panel en http://localhost:3000
```

En otra terminal, para probar el worker (sondeo SNMP + sincronización Excel):

```bash
pnpm worker:dev
```

Para importar/reimportar datos desde un Excel real:

```bash
pnpm import:excel "/ruta/al/TintaImpresoras.xlsx"
```

## Estructura

- `src/app` — panel web (Next.js App Router).
- `src/lib` — lógica compartida (Excel, SNMP, consumo, email, auth, ajustes).
- `src/worker` — proceso de sondeo/sincronización en segundo plano, independiente del panel.
- `prisma/schema.prisma` — modelo de datos (SQLite).
- `scripts/import-excel.ts` — importador/sincronizador inicial desde el Excel real.
