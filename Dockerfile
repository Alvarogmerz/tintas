# syntax=docker/dockerfile:1
FROM node:22-bookworm-slim AS base
RUN corepack enable
WORKDIR /app

# ---- deps: instalación completa (incluye devDependencies, hace falta para compilar) ----
FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile

# ---- build: cliente Prisma + build de Next + build del worker ----
FROM deps AS build
COPY . .
RUN pnpm exec prisma generate
RUN pnpm run build
RUN pnpm run worker:build

# ---- prod-deps: solo dependencias de producción, con su propio cliente Prisma ----
# (se regenera aquí, no se copia del stage build, para tener siempre el motor
# nativo correcto para esta imagen aunque cambie la plataforma de build)
FROM base AS prod-deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY prisma ./prisma
RUN pnpm install --frozen-lockfile --prod
RUN pnpm exec prisma generate

# ---- runner: imagen final, sirve tanto para "web" como para "poller" ----
FROM base AS runner
ENV NODE_ENV=production
COPY --from=prod-deps /app/node_modules ./node_modules
COPY --from=build /app/.next ./.next
COPY --from=build /app/public ./public
COPY --from=build /app/dist-worker ./dist-worker
COPY --from=build /app/prisma ./prisma
COPY package.json ./package.json

EXPOSE 3000
CMD ["pnpm", "start"]
