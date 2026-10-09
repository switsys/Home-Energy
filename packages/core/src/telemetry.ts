export type TelemetrySample = Readonly<{
  homeId: string;
  source: string;
  recordedAt: string;
  powerW: number | null;
  energyKwh: number | null;
}>;

export type TelemetrySummary = Readonly<{
  count: number;
  from: string | null;
  to: string | null;
  latestPowerW: number | null;
  meanPowerW: number | null;
  maxPowerW: number | null;
  energyKwh: number;
}>;

function round(value: number, digits = 3): number {
  const factor = 10 ** digits;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

export function summarizeTelemetry(
  samples: readonly TelemetrySample[],
): TelemetrySummary {
  const valid = samples
    .map((sample) => ({ sample, at: Date.parse(sample.recordedAt) }))
    .filter(
      (
        item,
      ): item is Readonly<{ sample: TelemetrySample; at: number }> =>
        Number.isFinite(item.at),
    )
    .sort((left, right) => left.at - right.at);

  const powers = valid
    .map(({ sample }) => sample.powerW)
    .filter((value): value is number => value !== null && Number.isFinite(value));

  const energyKwh = valid.reduce(
    (sum, { sample }) =>
      sum +
      (sample.energyKwh !== null && Number.isFinite(sample.energyKwh)
        ? sample.energyKwh
        : 0),
    0,
  );

  return {
    count: valid.length,
    from: valid[0]?.sample.recordedAt ?? null,
    to: valid.at(-1)?.sample.recordedAt ?? null,
    latestPowerW: valid.at(-1)?.sample.powerW ?? null,
    meanPowerW:
      powers.length === 0
        ? null
        : round(powers.reduce((sum, value) => sum + value, 0) / powers.length),
    maxPowerW: powers.length === 0 ? null : round(Math.max(...powers)),
    energyKwh: round(energyKwh),
  };
}
