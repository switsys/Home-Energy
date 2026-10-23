import type { GridTariff } from "./grid-tariff.js";
import type {
  EnergyPriceLevel,
  PriceSchedule,
  PriceSlot,
} from "./contracts.js";

const SLOT_MS = 15 * 60 * 1000;

export type EnergyAction = "run_now" | "wait" | "neutral";

export type EnergyPriceSlot = Readonly<{
  startsAt: string;
  total: number;
  currency: string;
  level: EnergyPriceLevel;
}>;

export type EnergyPriceWindow = Readonly<{
  minutes: number;
  startsAt: string;
  endsAt: string;
  average: number;
  minimum: number;
  maximum: number;
  currency: string;
}>;

export type EnergyAdvice = Readonly<{
  provider: string;
  homeId: string;
  generatedAt: string;
  current: EnergyPriceSlot | null;
  recommendation: Readonly<{
    action: EnergyAction;
    reason: string;
    currentPercentile: number | null;
    nextCheaperAt: string | null;
  }>;
  cheapestWindows: Readonly<{
    minutes30: EnergyPriceWindow | null;
    minutes60: EnergyPriceWindow | null;
    minutes120: EnergyPriceWindow | null;
  }>;
  cheapestSlots: readonly EnergyPriceSlot[];
  expensiveSlots: readonly EnergyPriceSlot[];
}>;

type ParsedSlot = Readonly<{
  price: EnergyPriceSlot;
  startMs: number;
}>;

function roundPrice(value: number): number {
  return Math.round((value + Number.EPSILON) * 100_000) / 100_000;
}

function parseSlot(price: PriceSlot): ParsedSlot | null {
  if (price.total === null || price.startsAt === null) return null;
  const startMs = Date.parse(price.startsAt);
  if (!Number.isFinite(startMs)) return null;

  return {
    price: {
      startsAt: new Date(startMs).toISOString(),
      total: price.total,
      currency: price.currency,
      level: price.level,
    },
    startMs,
  };
}

function schedule(response: PriceSchedule): readonly ParsedSlot[] {
  return [...response.today, ...response.tomorrow]
    .map(parseSlot)
    .filter((slot): slot is ParsedSlot => slot !== null)
    .sort((left, right) => left.startMs - right.startMs);
}

function currentPrice(
  response: PriceSchedule,
  slots: readonly ParsedSlot[],
  nowMs: number,
): EnergyPriceSlot | null {
  const supplied = response.current === null ? null : parseSlot(response.current);
  if (supplied !== null) return supplied.price;

  return (
    slots.find(
      (slot) => slot.startMs <= nowMs && nowMs < slot.startMs + SLOT_MS,
    )?.price ?? null
  );
}

function futureSlots(
  slots: readonly ParsedSlot[],
  nowMs: number,
): readonly ParsedSlot[] {
  return slots.filter((slot) => slot.startMs + SLOT_MS > nowMs);
}

function cheapestWindow(
  slots: readonly ParsedSlot[],
  slotCount: number,
): EnergyPriceWindow | null {
  let best: EnergyPriceWindow | null = null;

  for (let index = 0; index + slotCount <= slots.length; index += 1) {
    const window = slots.slice(index, index + slotCount);
    if (
      window.some(
        (slot, offset) =>
          offset > 0 &&
          slot.startMs - window[offset - 1].startMs !== SLOT_MS,
      )
    ) {
      continue;
    }

    const totals = window.map((slot) => slot.price.total);
    const average = roundPrice(
      totals.reduce((sum, value) => sum + value, 0) / totals.length,
    );
    const candidate: EnergyPriceWindow = {
      minutes: slotCount * 15,
      startsAt: window[0].price.startsAt,
      endsAt: new Date(window[window.length - 1].startMs + SLOT_MS).toISOString(),
      average,
      minimum: Math.min(...totals),
      maximum: Math.max(...totals),
      currency: window[0].price.currency,
    };

    if (
      best === null ||
      candidate.average < best.average ||
      (candidate.average === best.average &&
        Date.parse(candidate.startsAt) < Date.parse(best.startsAt))
    ) {
      best = candidate;
    }
  }

  return best;
}

function percentile(current: number, slots: readonly ParsedSlot[]): number | null {
  if (slots.length === 0) return null;
  const atOrBelow = slots.filter((slot) => slot.price.total <= current).length;
  return Math.round((atOrBelow / slots.length) * 100);
}

function topSlots(
  slots: readonly ParsedSlot[],
  direction: "cheap" | "expensive",
): readonly EnergyPriceSlot[] {
  return [...slots]
    .sort((left, right) =>
      direction === "cheap"
        ? left.price.total - right.price.total
        : right.price.total - left.price.total,
    )
    .slice(0, 5)
    .map((slot) => slot.price);
}

function recommendation(
  current: EnergyPriceSlot | null,
  future: readonly ParsedSlot[],
  best60: EnergyPriceWindow | null,
  nowMs: number,
): EnergyAdvice["recommendation"] {
  if (current === null) {
    return {
      action: "neutral",
      reason: "current_price_unavailable",
      currentPercentile: null,
      nextCheaperAt: null,
    };
  }

  const currentPercentile = percentile(current.total, future);
  const nextCheaper = future.find(
    (slot) => slot.startMs > nowMs && slot.price.total < current.total,
  );

  if (
    current.level === "VERY_CHEAP" ||
    (current.level !== "EXPENSIVE" &&
      current.level !== "VERY_EXPENSIVE" &&
      currentPercentile !== null &&
      currentPercentile <= 25)
  ) {
    return {
      action: "run_now",
      reason: "current_price_is_in_the_cheapest_quarter",
      currentPercentile,
      nextCheaperAt: nextCheaper?.price.startsAt ?? null,
    };
  }

  if (best60 !== null && Date.parse(best60.startsAt) > nowMs) {
    const saving = current.total - best60.average;
    const meaningfulSaving = Math.max(0.05, Math.abs(current.total) * 0.15);
    if (saving >= meaningfulSaving) {
      return {
        action: "wait",
        reason: "a_meaningfully_cheaper_60_minute_window_is_ahead",
        currentPercentile,
        nextCheaperAt: best60.startsAt,
      };
    }
  }

  return {
    action: "neutral",
    reason: "no_strong_price_signal",
    currentPercentile,
    nextCheaperAt: nextCheaper?.price.startsAt ?? null,
  };
}

/** Use verified per-inlet grid tariff charges for advice, without changing Tibber source data. */
export function variableDeliveredSchedule(
  source: PriceSchedule,
  gridTariff: GridTariff | null,
): PriceSchedule {
  if (gridTariff === null) return source;
  const adjust = (slot: PriceSlot | null): PriceSlot | null => {
    if (slot === null || slot.total === null || slot.startsAt === null) return slot;
    const at = new Date(slot.startsAt);
    if (!Number.isFinite(at.getTime()) || !Number.isFinite(slot.total)) {
      return { ...slot, total: null };
    }
    const quote = gridTariff.quote(at);
    const tax = quote.energyTaxPerKwh ?? 0;
    if (slot.currency !== quote.currency ||
        !Number.isFinite(quote.transferPerKwh) || quote.transferPerKwh < 0 ||
        !Number.isFinite(tax) || tax < 0) {
      return { ...slot, total: null };
    }
    return { ...slot, total: slot.total + quote.transferPerKwh + tax };
  };
  return {
    ...source,
    current: adjust(source.current),
    today: source.today.map((slot) => adjust(slot)!),
    tomorrow: source.tomorrow.map((slot) => adjust(slot)!),
  };
}

export function buildEnergyAdvice(
  response: PriceSchedule,
  now: Date = new Date(),
  gridTariff: GridTariff | null = null,
): EnergyAdvice {
  const effective = variableDeliveredSchedule(response, gridTariff);
  const allSlots = schedule(effective);
  const future = futureSlots(allSlots, now.getTime());
  const current = currentPrice(effective, allSlots, now.getTime());
  const minutes30 = cheapestWindow(future, 2);
  const minutes60 = cheapestWindow(future, 4);
  const minutes120 = cheapestWindow(future, 8);

  return {
    provider: response.provider,
    homeId: response.homeId,
    generatedAt: now.toISOString(),
    current,
    recommendation: recommendation(current, future, minutes60, now.getTime()),
    cheapestWindows: { minutes30, minutes60, minutes120 },
    cheapestSlots: topSlots(future, "cheap"),
    expensiveSlots: topSlots(future, "expensive"),
  };
}
