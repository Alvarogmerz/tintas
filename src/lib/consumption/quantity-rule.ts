import type { PrismaClient, ColorSlot } from "@prisma/client";
import { computeConsumptionRate } from "./rate";
import { getSetting } from "../settings";

export interface QuantityDecision {
  qty: number;
  ruleInputs: {
    reason: "insufficient_data" | "insufficient_fleet_data" | "normal_rate" | "above_fleet_average";
    ownRatePctPerDay: number | null;
    fleetMeanPctPerDay: number | null;
    fleetStddevPctPerDay: number | null;
    fleetSampleSize: number;
    stddevMultiplier: number;
  };
}

function mean(values: number[]): number {
  return values.reduce((a, b) => a + b, 0) / values.length;
}

function stddev(values: number[], avg: number): number {
  if (values.length < 2) return 0;
  const variance = values.reduce((sum, v) => sum + (v - avg) ** 2, 0) / (values.length - 1);
  return Math.sqrt(variance);
}

/**
 * Decide cuántas unidades pedir para un color de una impresora, comparando su
 * tasa de consumo reciente con la media de la flota para ese mismo color.
 * Regla explicable (no caja negra): si consume claramente más que la media
 * (> media + N desviaciones típicas, N configurable), pide el doble.
 */
export async function decideReorderQty(
  prisma: PrismaClient,
  printerId: number,
  colorSlot: ColorSlot,
): Promise<QuantityDecision> {
  const stddevMultiplier = await getSetting(prisma, "consumptionRuleStddevMultiplier");
  const maxQty = await getSetting(prisma, "consumptionRuleMaxQty");

  const own = await computeConsumptionRate(prisma, printerId, colorSlot);
  if (own.ratePctPerDay === null) {
    return {
      qty: 1,
      ruleInputs: {
        reason: "insufficient_data",
        ownRatePctPerDay: null,
        fleetMeanPctPerDay: null,
        fleetStddevPctPerDay: null,
        fleetSampleSize: 0,
        stddevMultiplier,
      },
    };
  }

  const fleetPrinters = await prisma.printer.findMany({ where: { isActive: true }, select: { id: true } });
  const fleetRates: number[] = [];
  for (const p of fleetPrinters) {
    const rate = await computeConsumptionRate(prisma, p.id, colorSlot);
    if (rate.ratePctPerDay !== null) fleetRates.push(rate.ratePctPerDay);
  }

  if (fleetRates.length < 2) {
    return {
      qty: 1,
      ruleInputs: {
        reason: "insufficient_fleet_data",
        ownRatePctPerDay: own.ratePctPerDay,
        fleetMeanPctPerDay: null,
        fleetStddevPctPerDay: null,
        fleetSampleSize: fleetRates.length,
        stddevMultiplier,
      },
    };
  }

  const fleetMean = mean(fleetRates);
  const fleetStddev = stddev(fleetRates, fleetMean);
  const threshold = fleetMean + stddevMultiplier * fleetStddev;
  const aboveAverage = own.ratePctPerDay > threshold;

  return {
    qty: aboveAverage ? Math.min(2, maxQty) : 1,
    ruleInputs: {
      reason: aboveAverage ? "above_fleet_average" : "normal_rate",
      ownRatePctPerDay: own.ratePctPerDay,
      fleetMeanPctPerDay: fleetMean,
      fleetStddevPctPerDay: fleetStddev,
      fleetSampleSize: fleetRates.length,
      stddevMultiplier,
    },
  };
}
