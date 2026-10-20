export type PriceCurvePeriod = "today" | "tomorrow" | "2days";

// Both price slots and network tariff slots share startsAt. Keep the same
// period filter for both so Energy Lens cannot mix different days.
export function selectPriceCurveSlots<T extends { startsAt: string }>(
  today: readonly T[],
  tomorrow: readonly T[],
  period: PriceCurvePeriod,
): readonly T[] {
  if (period === "today") return today;
  if (period === "tomorrow") return tomorrow;

  const seen = new Set<string>();
  return [...today, ...tomorrow]
    .filter((slot) => {
      if (seen.has(slot.startsAt)) return false;
      seen.add(slot.startsAt);
      return true;
    })
    .sort((a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt));
}
