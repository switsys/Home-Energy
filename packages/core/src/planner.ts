import type { PriceSchedule, PriceSlot } from "./contracts.js";
import {
  estimatePlannedDemandImpact,
  type DemandPeakReport,
  type PlannedDemandImpact,
} from "./demand-peaks.js";
import type {
  GridLoadPeriod,
  GridSeason,
  GridTariff,
} from "./grid-tariff.js";

const SLOT_MS = 15 * 60 * 1000;
const HOUR_MS = 60 * 60 * 1000;
const STOCKHOLM = "Europe/Stockholm";

function stockholmDate(atMs: number): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: STOCKHOLM,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(atMs));

  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? "";

  return `${get("year")}-${get("month")}-${get("day")}`;
}

export type LoadPlanAction = "run_now" | "wait";

export type LoadPlanGridPeriod = Readonly<{
  loadPeriod: GridLoadPeriod;
  season: GridSeason;
  minutes: number;
  demandRatePerKwMonth: number;
}>;

export type LoadPlanGridSummary = Readonly<{
  tariffId: string;
  label: string;
  transferCost: number;
  highestDemandRatePerKwMonth: number;
  peakWindowMinutes: number;
  peakAveragingCount: number;
  demandChargeIncludedInEstimatedCost: false;
  demandImpact: PlannedDemandImpact;
  periods: readonly LoadPlanGridPeriod[];
}>;

export type LoadPlanWindow = Readonly<{
  startsAt: string;
  endsAt: string;
  durationMinutes: number;
  powerKw: number;
  energyKwh: number;
  averagePrice: number;
  energyPriceCost: number;
  gridTransferCost: number;
  estimatedCost: number;
  comparisonCost: number;
  currency: string;
  grid: LoadPlanGridSummary | null;
}>;

export type LoadPlan = Readonly<{
  provider: string;
  homeId: string;
  generatedAt: string;
  action: LoadPlanAction;
  reason:
    | "best_window_starts_now"
    | "future_window_saves_meaningful_money"
    | "future_saving_is_too_small_to_wait"
    | "immediate_start_not_covered_by_price_data";
  immediate: LoadPlanWindow | null;
  best: LoadPlanWindow;
  savings: number | null;
  savingsPercent: number | null;
}>;

type ParsedSlot = Readonly<{
  startsAtMs: number;
  total: number;
  currency: string;
}>;

function round(value: number, digits = 5): number {
  const factor = 10 ** digits;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

function parsePriceSlot(slot: PriceSlot): ParsedSlot | null {
  if (slot.total === null || slot.startsAt === null) return null;

  const startsAtMs = Date.parse(slot.startsAt);
  if (!Number.isFinite(startsAtMs)) return null;

  return {
    startsAtMs,
    total: slot.total,
    currency: slot.currency,
  };
}

function parsedSlots(schedule: PriceSchedule): readonly ParsedSlot[] {
  const all = [
    ...(schedule.current === null ? [] : [schedule.current]),
    ...schedule.today,
    ...schedule.tomorrow,
  ]
    .map(parsePriceSlot)
    .filter((slot): slot is ParsedSlot => slot !== null)
    .sort((left, right) => left.startsAtMs - right.startsAtMs);

  const deduplicated = new Map<number, ParsedSlot>();
  for (const slot of all) deduplicated.set(slot.startsAtMs, slot);
  return [...deduplicated.values()];
}

function buildWindow(
  slots: readonly ParsedSlot[],
  startMs: number,
  durationMinutes: number,
  powerKw: number,
  gridTariff: GridTariff | null,
  demandPeaks: DemandPeakReport | null,
): LoadPlanWindow | null {
  const endMs = startMs + durationMinutes * 60_000;
  let cursor = startMs;
  let energyPriceCost = 0;
  let gridTransferCost = 0;
  let currency: string | null = null;
  let gridLabel: string | null = null;
  let gridTariffId: string | null = null;
  let peakWindowMinutes = 0;
  let peakAveragingCount = 0;
  const gridPeriods = new Map<
    string,
    {
      loadPeriod: GridLoadPeriod;
      season: GridSeason;
      minutes: number;
      demandRatePerKwMonth: number;
    }
  >();
  const demandHourEnergy = new Map<
    number,
    { date: string; energyKwh: number }
  >();

  for (const slot of slots) {
    const slotEndMs = slot.startsAtMs + SLOT_MS;
    if (slotEndMs <= cursor) continue;
    if (slot.startsAtMs >= endMs) break;

    const overlapStart = Math.max(cursor, slot.startsAtMs);
    if (overlapStart > cursor) return null;

    if (currency === null) currency = slot.currency;
    if (slot.currency !== currency) return null;

    const overlapEnd = Math.min(slotEndMs, endMs);
    if (overlapEnd <= overlapStart) continue;

    const overlapHours = (overlapEnd - overlapStart) / HOUR_MS;
    energyPriceCost += slot.total * powerKw * overlapHours;

    if (gridTariff !== null) {
      const quote = gridTariff.quote(new Date(overlapStart));
      if (quote.currency !== currency) {
        throw new Error(
          `Grid tariff currency ${quote.currency} does not match energy price currency ${currency}`,
        );
      }

      gridTransferCost += quote.transferPerKwh * powerKw * overlapHours;
      gridLabel = quote.label;
      gridTariffId = quote.tariffId;
      peakWindowMinutes = quote.peakWindowMinutes;
      peakAveragingCount = quote.peakAveragingCount;

      const key = `${quote.loadPeriod}:${quote.season}:${quote.demandRatePerKwMonth}`;
      const current = gridPeriods.get(key);
      const overlapMinutes = (overlapEnd - overlapStart) / 60_000;
      gridPeriods.set(key, {
        loadPeriod: quote.loadPeriod,
        season: quote.season,
        minutes: (current?.minutes ?? 0) + overlapMinutes,
        demandRatePerKwMonth: quote.demandRatePerKwMonth,
      });

      if (quote.demandRatePerKwMonth > 0) {
        let demandCursor = overlapStart;
        while (demandCursor < overlapEnd) {
          const hourStart = Math.floor(demandCursor / HOUR_MS) * HOUR_MS;
          const hourEnd = hourStart + HOUR_MS;
          const segmentEnd = Math.min(overlapEnd, hourEnd);
          const segmentHours = (segmentEnd - demandCursor) / HOUR_MS;
          const existing = demandHourEnergy.get(hourStart);
          demandHourEnergy.set(hourStart, {
            date: existing?.date ?? stockholmDate(hourStart),
            energyKwh:
              (existing?.energyKwh ?? 0) + powerKw * segmentHours,
          });
          demandCursor = segmentEnd;
        }
      }
    }

    cursor = overlapEnd;

    if (cursor >= endMs) break;
  }

  if (cursor < endMs || currency === null) return null;

  const energyKwh = powerKw * (durationMinutes / 60);
  const estimatedCost = energyPriceCost + gridTransferCost;
  const periods = [...gridPeriods.values()].map((period) => ({
    ...period,
    minutes: round(period.minutes, 1),
  }));

  const dailyContributions = new Map<string, number>();
  for (const hour of demandHourEnergy.values()) {
    const existing = dailyContributions.get(hour.date) ?? 0;
    dailyContributions.set(
      hour.date,
      Math.max(existing, hour.energyKwh),
    );
  }

  const matchingDemandPeaks =
    gridTariffId !== null && demandPeaks?.tariffId === gridTariffId
      ? demandPeaks
      : null;
  const demandImpact = estimatePlannedDemandImpact(
    matchingDemandPeaks,
    [...dailyContributions].map(([date, averageKw]) => ({
      date,
      averageKw: round(averageKw, 3),
    })),
  );
  const comparisonCost =
    estimatedCost + (demandImpact.minimumIncrementalDemandCharge ?? 0);

  return {
    startsAt: new Date(startMs).toISOString(),
    endsAt: new Date(endMs).toISOString(),
    durationMinutes,
    powerKw: round(powerKw, 3),
    energyKwh: round(energyKwh, 3),
    averagePrice: round(estimatedCost / energyKwh),
    energyPriceCost: round(energyPriceCost),
    gridTransferCost: round(gridTransferCost),
    estimatedCost: round(estimatedCost),
    comparisonCost: round(comparisonCost),
    currency,
    grid:
      gridTariffId === null || gridLabel === null
        ? null
        : {
            tariffId: gridTariffId,
            label: gridLabel,
            transferCost: round(gridTransferCost),
            highestDemandRatePerKwMonth: Math.max(
              ...periods.map((period) => period.demandRatePerKwMonth),
            ),
            peakWindowMinutes,
            peakAveragingCount,
            demandChargeIncludedInEstimatedCost: false,
            demandImpact,
            periods,
          },
  };
}

export function buildLoadPlan(
  schedule: PriceSchedule,
  input: Readonly<{ durationMinutes: number; powerKw: number }>,
  now: Date = new Date(),
  gridTariff: GridTariff | null = null,
  demandPeaks: DemandPeakReport | null = null,
): LoadPlan {
  if (
    !Number.isInteger(input.durationMinutes) ||
    input.durationMinutes < 15 ||
    input.durationMinutes > 24 * 60
  ) {
    throw new RangeError("durationMinutes must be an integer from 15 to 1440");
  }

  if (
    !Number.isFinite(input.powerKw) ||
    input.powerKw <= 0 ||
    input.powerKw > 100
  ) {
    throw new RangeError("powerKw must be greater than 0 and no more than 100");
  }

  const slots = parsedSlots(schedule);
  const nowMs = now.getTime();
  const starts = [
    nowMs,
    ...slots
      .map((slot) => slot.startsAtMs)
      .filter((startsAtMs) => startsAtMs > nowMs),
  ];

  const candidates = starts
    .map((startsAtMs) =>
      buildWindow(
        slots,
        startsAtMs,
        input.durationMinutes,
        input.powerKw,
        gridTariff,
      ),
    )
    .filter((window): window is LoadPlanWindow => window !== null);

  if (candidates.length === 0) {
    throw new Error("Not enough contiguous price data to plan this load");
  }

  const immediate =
    candidates.find((candidate) => Date.parse(candidate.startsAt) === nowMs) ??
    null;

  const best = [...candidates].sort((left, right) => {
    const cost = left.comparisonCost - right.comparisonCost;
    if (cost !== 0) return cost;

    const demandRate =
      (left.grid?.highestDemandRatePerKwMonth ?? 0) -
      (right.grid?.highestDemandRatePerKwMonth ?? 0);
    if (demandRate !== 0) return demandRate;

    return Date.parse(left.startsAt) - Date.parse(right.startsAt);
  })[0];

  if (immediate === null) {
    return {
      provider: schedule.provider,
      homeId: schedule.homeId,
      generatedAt: now.toISOString(),
      action: "wait",
      reason: "immediate_start_not_covered_by_price_data",
      immediate: null,
      best,
      savings: null,
      savingsPercent: null,
    };
  }

  const bestStartsNow = Date.parse(best.startsAt) === nowMs;
  const savings = round(
    Math.max(0, immediate.comparisonCost - best.comparisonCost),
  );
  const meaningfulSaving = Math.max(
    0.1,
    Math.abs(immediate.comparisonCost) * 0.1,
  );
  const savingsPercent =
    immediate.comparisonCost > 0
      ? round((savings / immediate.comparisonCost) * 100, 1)
      : null;

  if (bestStartsNow) {
    return {
      provider: schedule.provider,
      homeId: schedule.homeId,
      generatedAt: now.toISOString(),
      action: "run_now",
      reason: "best_window_starts_now",
      immediate,
      best,
      savings,
      savingsPercent,
    };
  }

  if (savings >= meaningfulSaving) {
    return {
      provider: schedule.provider,
      homeId: schedule.homeId,
      generatedAt: now.toISOString(),
      action: "wait",
      reason: "future_window_saves_meaningful_money",
      immediate,
      best,
      savings,
      savingsPercent,
    };
  }

  return {
    provider: schedule.provider,
    homeId: schedule.homeId,
    generatedAt: now.toISOString(),
    action: "run_now",
    reason: "future_saving_is_too_small_to_wait",
    immediate,
    best,
    savings,
    savingsPercent,
  };
}
