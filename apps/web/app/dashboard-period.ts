/** Dashboard period selection is presentation-only; it never changes meter billing scopes. */
export type ConsumptionDays = 7 | 30;

export function selectedConsumptionDays(
  value: string | string[] | undefined,
): ConsumptionDays {
  const first = Array.isArray(value) ? value[0] : value;
  return first === "30" ? 30 : 7;
}

export function dashboardPeriodUrl(options: {
  days: ConsumptionDays;
  minutes: number;
  powerKw: number;
  homeId: string | null;
}): string {
  const params = new URLSearchParams({
    days: String(options.days),
    minutes: String(options.minutes),
    powerKw: String(options.powerKw),
  });
  if (options.homeId !== null) {
    params.set("homeId", options.homeId);
  }
  return `/?${params.toString()}`;
}
