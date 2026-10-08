import type { ConsumptionSample } from "./contracts.js";
import type { GridTariff } from "./grid-tariff.js";

const STOCKHOLM = "Europe/Stockholm";
const HOUR_MS = 60 * 60 * 1000;

export type DemandPeakStatus =
  | "inactive"
  | "no_data"
  | "partial"
  | "estimated";

export type DemandPeakDay = Readonly<{
  date: string;
  startsAt: string;
  averageKw: number;
}>;

export type DemandPeakReport = Readonly<{
  tariffId: string;
  label: string;
  currency: string;
  generatedAt: string;
  billingMonth: string;
  status: DemandPeakStatus;
  demandRatePerKwMonth: number;
  requiredPeakDays: number;
  eligibleHours: number;
  peakDays: readonly DemandPeakDay[];
  trackedAveragePeakKw: number | null;
  thresholdKw: number | null;
  estimatedDemandCharge: number | null;
}>;

export type DemandImpactStatus = "none" | "unknown" | "possible" | "definite";

export type PlannedDemandDay = Readonly<{
  date: string;
  averageKw: number;
}>;

export type PlannedDemandImpact = Readonly<{
  status: DemandImpactStatus;
  thresholdKw: number | null;
  plannedPeakContributionKw: number;
  currentEstimatedDemandCharge: number | null;
  projectedMinimumDemandCharge: number | null;
  minimumIncrementalDemandCharge: number | null;
  demandRatePerKwMonth: number;
}>;

type LocalParts = Readonly<{
  year: number;
  month: number;
  day: number;
  date: string;
  billingMonth: string;
}>;

function round(value: number, digits = 3): number {
  const factor = 10 ** digits;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

function localParts(at: Date): LocalParts {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: STOCKHOLM,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(at);

  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? "";

  const year = Number(get("year"));
  const monthText = get("month");
  const dayText = get("day");

  return {
    year,
    month: Number(monthText),
    day: Number(dayText),
    date: `${year}-${monthText}-${dayText}`,
    billingMonth: `${year}-${monthText}`,
  };
}

function monthDemandSettings(
  tariff: GridTariff,
  now: Date,
): Readonly<{
  rate: number;
  requiredPeakDays: number;
  currency: string;
}> {
  const target = localParts(now);
  let rate = 0;
  let requiredPeakDays = 3;
  let currency = "SEK";

  for (let day = 1; day <= 31; day += 1) {
    const probe = new Date(Date.UTC(target.year, target.month - 1, day, 11, 0, 0));
    const local = localParts(probe);
    if (local.billingMonth !== target.billingMonth) continue;

    const quote = tariff.quote(probe);
    rate = Math.max(rate, quote.demandRatePerKwMonth);
    requiredPeakDays = quote.peakAveragingCount;
    currency = quote.currency;
  }

  return { rate, requiredPeakDays, currency };
}

function averagePowerKw(sample: ConsumptionSample): number | null {
  if (
    sample.consumption === null ||
    !Number.isFinite(sample.consumption) ||
    sample.consumption < 0
  ) {
    return null;
  }

  const unit = sample.consumptionUnit?.trim().toLowerCase() ?? "kwh";
  if (unit !== "kwh") return null;

  const from = Date.parse(sample.from);
  const to = Date.parse(sample.to);
  if (!Number.isFinite(from) || !Number.isFinite(to) || to <= from) return null;

  const durationHours = (to - from) / HOUR_MS;
  if (durationHours <= 0) return null;

  return sample.consumption / durationHours;
}

export function buildDemandPeakReport(
  samples: readonly ConsumptionSample[],
  tariff: GridTariff,
  now: Date = new Date(),
): DemandPeakReport {
  const generatedAt = now.toISOString();
  const billingMonth = localParts(now).billingMonth;
  const settings = monthDemandSettings(tariff, now);

  if (settings.rate <= 0) {
    return {
      tariffId: tariff.id,
      label: tariff.label,
      currency: settings.currency,
      generatedAt,
      billingMonth,
      status: "inactive",
      demandRatePerKwMonth: 0,
      requiredPeakDays: settings.requiredPeakDays,
      eligibleHours: 0,
      peakDays: [],
      trackedAveragePeakKw: null,
      thresholdKw: null,
      estimatedDemandCharge: null,
    };
  }

  const dailyPeaks = new Map<string, DemandPeakDay>();
  let eligibleHours = 0;

  for (const sample of samples) {
    const startsAt = new Date(sample.from);
    if (!Number.isFinite(startsAt.getTime())) continue;

    const local = localParts(startsAt);
    if (local.billingMonth !== billingMonth) continue;

    const quote = tariff.quote(startsAt);
    if (quote.demandRatePerKwMonth <= 0) continue;

    const averageKw = averagePowerKw(sample);
    if (averageKw === null) continue;

    eligibleHours += 1;
    const candidate: DemandPeakDay = {
      date: local.date,
      startsAt: startsAt.toISOString(),
      averageKw: round(averageKw),
    };

    const existing = dailyPeaks.get(local.date);
    if (existing === undefined || candidate.averageKw > existing.averageKw) {
      dailyPeaks.set(local.date, candidate);
    }
  }

  const peakDays = [...dailyPeaks.values()]
    .sort((left, right) => {
      const power = right.averageKw - left.averageKw;
      if (power !== 0) return power;
      return Date.parse(left.startsAt) - Date.parse(right.startsAt);
    })
    .slice(0, settings.requiredPeakDays);

  if (peakDays.length === 0) {
    return {
      tariffId: tariff.id,
      label: tariff.label,
      currency: settings.currency,
      generatedAt,
      billingMonth,
      status: "no_data",
      demandRatePerKwMonth: settings.rate,
      requiredPeakDays: settings.requiredPeakDays,
      eligibleHours,
      peakDays,
      trackedAveragePeakKw: null,
      thresholdKw: null,
      estimatedDemandCharge: null,
    };
  }

  const trackedAveragePeakKw = round(
    peakDays.reduce((sum, peak) => sum + peak.averageKw, 0) / peakDays.length,
  );
  const complete = peakDays.length >= settings.requiredPeakDays;
  const thresholdKw = complete
    ? round(peakDays[settings.requiredPeakDays - 1]?.averageKw ?? 0)
    : null;

  return {
    tariffId: tariff.id,
    label: tariff.label,
    currency: settings.currency,
    generatedAt,
    billingMonth,
    status: complete ? "estimated" : "partial",
    demandRatePerKwMonth: settings.rate,
    requiredPeakDays: settings.requiredPeakDays,
    eligibleHours,
    peakDays,
    trackedAveragePeakKw,
    thresholdKw,
    estimatedDemandCharge: complete
      ? round(trackedAveragePeakKw * settings.rate, 2)
      : null,
  };
}


export function estimatePlannedDemandImpact(
  report: DemandPeakReport | null,
  plannedDailyPeaks: readonly PlannedDemandDay[],
): PlannedDemandImpact {
  const plannedPeakContributionKw =
    plannedDailyPeaks.length === 0
      ? 0
      : round(
          Math.max(...plannedDailyPeaks.map((peak) => peak.averageKw)),
        );

  if (
    plannedDailyPeaks.length === 0 ||
    report === null ||
    report.status === "inactive" ||
    report.demandRatePerKwMonth <= 0
  ) {
    return {
      status: "none",
      thresholdKw: report?.thresholdKw ?? null,
      plannedPeakContributionKw,
      currentEstimatedDemandCharge: report?.estimatedDemandCharge ?? null,
      projectedMinimumDemandCharge: report?.estimatedDemandCharge ?? null,
      minimumIncrementalDemandCharge: 0,
      demandRatePerKwMonth: report?.demandRatePerKwMonth ?? 0,
    };
  }

  if (
    report.status !== "estimated" ||
    report.thresholdKw === null ||
    report.estimatedDemandCharge === null ||
    report.peakDays.length < report.requiredPeakDays
  ) {
    return {
      status: "unknown",
      thresholdKw: report.thresholdKw,
      plannedPeakContributionKw,
      currentEstimatedDemandCharge: report.estimatedDemandCharge,
      projectedMinimumDemandCharge: null,
      minimumIncrementalDemandCharge: null,
      demandRatePerKwMonth: report.demandRatePerKwMonth,
    };
  }

  const projectedDailyPeaks = new Map<string, number>();
  for (const peak of report.peakDays) {
    projectedDailyPeaks.set(peak.date, peak.averageKw);
  }

  for (const planned of plannedDailyPeaks) {
    const existing = projectedDailyPeaks.get(planned.date) ?? 0;
    projectedDailyPeaks.set(
      planned.date,
      Math.max(existing, planned.averageKw),
    );
  }

  const top = [...projectedDailyPeaks.values()]
    .sort((left, right) => right - left)
    .slice(0, report.requiredPeakDays);

  if (top.length < report.requiredPeakDays) {
    return {
      status: "unknown",
      thresholdKw: report.thresholdKw,
      plannedPeakContributionKw,
      currentEstimatedDemandCharge: report.estimatedDemandCharge,
      projectedMinimumDemandCharge: null,
      minimumIncrementalDemandCharge: null,
      demandRatePerKwMonth: report.demandRatePerKwMonth,
    };
  }

  const projectedAverageKw =
    top.reduce((sum, value) => sum + value, 0) / top.length;
  const projectedMinimumDemandCharge = round(
    projectedAverageKw * report.demandRatePerKwMonth,
    2,
  );
  const minimumIncrementalDemandCharge = round(
    Math.max(
      0,
      projectedMinimumDemandCharge - report.estimatedDemandCharge,
    ),
    2,
  );

  return {
    status:
      minimumIncrementalDemandCharge > 0 ? "definite" : "possible",
    thresholdKw: report.thresholdKw,
    plannedPeakContributionKw,
    currentEstimatedDemandCharge: report.estimatedDemandCharge,
    projectedMinimumDemandCharge,
    minimumIncrementalDemandCharge,
    demandRatePerKwMonth: report.demandRatePerKwMonth,
  };
}
