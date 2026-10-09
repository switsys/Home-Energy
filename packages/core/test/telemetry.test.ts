import { describe, expect, it } from "vitest";
import { summarizeTelemetry, type TelemetrySample } from "../src/index.js";

function sample(
  recordedAt: string,
  powerW: number | null,
  energyKwh: number | null,
): TelemetrySample {
  return {
    homeId: "home-1",
    source: "clamp-main",
    recordedAt,
    powerW,
    energyKwh,
  };
}

describe("summarizeTelemetry", () => {
  it("summarizes valid telemetry in chronological order", () => {
    const summary = summarizeTelemetry([
      sample("2026-10-09T10:15:00Z", 1800, 0.45),
      sample("2026-10-09T10:00:00Z", 1200, 0.3),
      sample("2026-10-09T10:30:00Z", 2400, 0.6),
    ]);

    expect(summary).toEqual({
      count: 3,
      from: "2026-10-09T10:00:00Z",
      to: "2026-10-09T10:30:00Z",
      latestPowerW: 2400,
      meanPowerW: 1800,
      maxPowerW: 2400,
      energyKwh: 1.35,
    });
  });

  it("ignores invalid timestamps and tolerates missing measurements", () => {
    const summary = summarizeTelemetry([
      sample("not-a-date", 9999, 10),
      sample("2026-10-09T10:00:00Z", null, null),
    ]);

    expect(summary).toEqual({
      count: 1,
      from: "2026-10-09T10:00:00Z",
      to: "2026-10-09T10:00:00Z",
      latestPowerW: null,
      meanPowerW: null,
      maxPowerW: null,
      energyKwh: 0,
    });
  });
});
