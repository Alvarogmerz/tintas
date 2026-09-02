import type { PrismaClient, ColorSlot } from "@prisma/client";

export interface ConsumptionRate {
  ratePctPerDay: number | null; // null = datos insuficientes
  sampleReadings: number;
  windowStart: Date | null;
  windowEnd: Date | null;
}

const REPLENISH_JUMP_PP = 15; // subida de nivel que consideramos "se cambió el cartucho"
const MIN_READINGS_FOR_RATE = 3; // exige varias lecturas en la ventana para amortiguar ruido

/**
 * Tasa de consumo (%/día) de un color en una impresora desde la última
 * recarga detectada (un salto de nivel hacia arriba). Con menos de
 * MIN_READINGS_FOR_RATE lecturas en esa ventana, se considera que no hay
 * datos suficientes todavía (rate = null) — el llamador debe usar cantidad 1
 * por defecto en ese caso.
 */
export async function computeConsumptionRate(
  prisma: PrismaClient,
  printerId: number,
  colorSlot: ColorSlot,
): Promise<ConsumptionRate> {
  const readings = await prisma.inkLevelReading.findMany({
    where: { printerId, colorSlot, levelPercent: { not: null } },
    orderBy: { readAt: "asc" },
  });

  if (readings.length < 2) {
    return { ratePctPerDay: null, sampleReadings: readings.length, windowStart: null, windowEnd: null };
  }

  let windowStartIdx = 0;
  for (let i = 1; i < readings.length; i++) {
    const prev = readings[i - 1].levelPercent!;
    const curr = readings[i].levelPercent!;
    if (curr - prev >= REPLENISH_JUMP_PP) {
      windowStartIdx = i;
    }
  }

  const window = readings.slice(windowStartIdx);
  if (window.length < MIN_READINGS_FOR_RATE) {
    return {
      ratePctPerDay: null,
      sampleReadings: window.length,
      windowStart: window[0]?.readAt ?? null,
      windowEnd: window[window.length - 1]?.readAt ?? null,
    };
  }

  const first = window[0];
  const last = window[window.length - 1];
  const days = (last.readAt.getTime() - first.readAt.getTime()) / (1000 * 60 * 60 * 24);
  if (days <= 0) {
    return { ratePctPerDay: 0, sampleReadings: window.length, windowStart: first.readAt, windowEnd: last.readAt };
  }

  const drop = first.levelPercent! - last.levelPercent!;
  const ratePctPerDay = Math.max(0, drop / days);

  return { ratePctPerDay, sampleReadings: window.length, windowStart: first.readAt, windowEnd: last.readAt };
}
