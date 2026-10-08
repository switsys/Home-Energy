export type GridLoadPeriod = "low" | "high";
export type GridSeason = "summer" | "winter";

export type GridTariffQuote = Readonly<{
  tariffId: string;
  label: string;
  currency: string;
  transferPerKwh: number;
  loadPeriod: GridLoadPeriod;
  season: GridSeason;
  demandRatePerKwMonth: number;
  peakWindowMinutes: number;
  peakAveragingCount: number;
}>;

export interface GridTariff {
  readonly id: string;
  readonly label: string;
  quote(at: Date): GridTariffQuote;
}

const STOCKHOLM = "Europe/Stockholm";

function stockholmParts(at: Date) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: STOCKHOLM,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    hourCycle: "h23",
    weekday: "short",
  }).formatToParts(at);

  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? "";

  return {
    year: Number(get("year")),
    month: Number(get("month")),
    day: Number(get("day")),
    hour: Number(get("hour")),
    weekday: get("weekday"),
  };
}

function easterSunday(year: number): Readonly<{ month: number; day: number }> {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return { month, day };
}

function addUtcDays(
  year: number,
  month: number,
  day: number,
  delta: number,
): Readonly<{ year: number; month: number; day: number }> {
  const date = new Date(Date.UTC(year, month - 1, day + delta));
  return {
    year: date.getUTCFullYear(),
    month: date.getUTCMonth() + 1,
    day: date.getUTCDate(),
  };
}

function saturdayBetween(
  year: number,
  month: number,
  firstDay: number,
  lastDay: number,
): number {
  for (let day = firstDay; day <= lastDay; day += 1) {
    if (new Date(Date.UTC(year, month - 1, day)).getUTCDay() === 6) return day;
  }
  throw new Error("Saturday not found in requested interval");
}

function isSwedishPublicHoliday(
  year: number,
  month: number,
  day: number,
): boolean {
  const fixed = new Set([
    "1-1",
    "1-6",
    "5-1",
    "6-6",
    "12-25",
    "12-26",
  ]);
  if (fixed.has(`${month}-${day}`)) return true;

  const easter = easterSunday(year);
  const easterOffsets = [-2, 0, 1, 39];
  if (
    easterOffsets.some((offset) => {
      const date = addUtcDays(year, easter.month, easter.day, offset);
      return date.month === month && date.day === day;
    })
  ) {
    return true;
  }

  const midsummerDay = saturdayBetween(year, 6, 20, 26);
  if (month === 6 && day === midsummerDay) return true;

  for (let offset = 0; offset <= 6; offset += 1) {
    const candidate = addUtcDays(year, 10, 31, offset);
    if (
      new Date(
        Date.UTC(candidate.year, candidate.month - 1, candidate.day),
      ).getUTCDay() === 6
    ) {
      return candidate.month === month && candidate.day === day;
    }
  }

  return false;
}

export const dalaEnergi2026: GridTariff = {
  id: "dala-energi-2026",
  label: "Dala Energi 2026",

  quote(at: Date): GridTariffQuote {
    const local = stockholmParts(at);
    const weekend = local.weekday === "Sat" || local.weekday === "Sun";
    const holiday = isSwedishPublicHoliday(local.year, local.month, local.day);
    const highHours = local.hour >= 7 && local.hour < 19;
    const loadPeriod: GridLoadPeriod =
      !weekend && !holiday && highHours ? "high" : "low";
    const season: GridSeason =
      local.month >= 11 || local.month <= 3 ? "winter" : "summer";

    return {
      tariffId: this.id,
      label: this.label,
      currency: "SEK",
      transferPerKwh: 0.09,
      loadPeriod,
      season,
      demandRatePerKwMonth:
        loadPeriod === "high" && season === "winter" ? 105 : 35,
      peakWindowMinutes: 60,
      peakAveragingCount: 3,
    };
  },
};

export function resolveGridTariff(
  id: string | null | undefined,
): GridTariff | null {
  const normalized = id?.trim().toLowerCase() ?? "";
  if (normalized === "") return null;

  if (
    normalized === dalaEnergi2026.id ||
    normalized === "dalaenergi-2026" ||
    normalized === "dala-energi"
  ) {
    return dalaEnergi2026;
  }

  throw new Error(`Unknown grid tariff: ${id}`);
}
