import { describe, expect, it } from "vitest";
import { buildLoadPlan, faluElnat2026, type PriceSchedule, type PriceSlot } from "../src/index.js";

function price(startsAt: string, total: number): PriceSlot {
  return {
    total,
    energy: total,
    tax: 0,
    startsAt,
    currency: "SEK",
    level: null,
  };
}

function schedule(today: readonly PriceSlot[]): PriceSchedule {
  return {
    provider: "test",
    homeId: "home-1",
    current: today[0] ?? null,
    today,
    tomorrow: [],
  };
}

describe("buildLoadPlan", () => {
  it("finds the cheapest contiguous future window and estimates savings", () => {
    const prices = [
      price("2026-10-07T10:00:00+02:00", 2.0),
      price("2026-10-07T10:15:00+02:00", 2.0),
      price("2026-10-07T10:30:00+02:00", 0.5),
      price("2026-10-07T10:45:00+02:00", 0.5),
      price("2026-10-07T11:00:00+02:00", 0.5),
      price("2026-10-07T11:15:00+02:00", 0.5),
    ];

    const plan = buildLoadPlan(
      schedule(prices),
      { durationMinutes: 60, powerKw: 2 },
      new Date("2026-10-07T10:00:00+02:00"),
    );

    expect(plan.action).toBe("wait");
    expect(plan.immediate?.estimatedCost).toBe(2.5);
    expect(plan.best).toMatchObject({
      startsAt: "2026-10-07T08:30:00.000Z",
      endsAt: "2026-10-07T09:30:00.000Z",
      estimatedCost: 1,
      energyKwh: 2,
      averagePrice: 0.5,
    });
    expect(plan.savings).toBe(1.5);
    expect(plan.savingsPercent).toBe(60);
  });

  it("integrates the remaining fraction of the current price slot", () => {
    const prices = [
      price("2026-10-07T10:00:00+02:00", 2.0),
      price("2026-10-07T10:15:00+02:00", 1.0),
      price("2026-10-07T10:30:00+02:00", 1.0),
      price("2026-10-07T10:45:00+02:00", 2.0),
    ];

    const plan = buildLoadPlan(
      schedule(prices),
      { durationMinutes: 30, powerKw: 1 },
      new Date("2026-10-07T10:07:00+02:00"),
    );

    expect(plan.immediate?.estimatedCost).toBeCloseTo(0.63333, 5);
    expect(plan.best.estimatedCost).toBe(0.5);
    expect(plan.best.startsAt).toBe("2026-10-07T08:15:00.000Z");
    expect(plan.action).toBe("wait");
  });

  it("adds the configured grid transfer fee without pretending the monthly demand charge is exact", () => {
    const prices = [
      price("2026-10-08T12:00:00+02:00", 1.0),
      price("2026-10-08T12:15:00+02:00", 1.0),
      price("2026-10-08T12:30:00+02:00", 1.0),
      price("2026-10-08T12:45:00+02:00", 1.0),
    ];

    const plan = buildLoadPlan(
      schedule(prices),
      { durationMinutes: 60, powerKw: 2 },
      new Date("2026-10-08T12:00:00+02:00"),
      faluElnat2026,
    );

    expect(plan.best).toMatchObject({
      energyKwh: 2,
      energyPriceCost: 2,
      gridTransferCost: 0.225,
      estimatedCost: 2.225,
      averagePrice: 1.1125,
    });
    expect(plan.best.grid).toMatchObject({
      tariffId: "falu-elnat-2026",
      highestDemandRatePerKwMonth: 0,
      peakWindowMinutes: 60,
      peakAveragingCount: 3,
      demandChargeIncludedInEstimatedCost: false,
    });
  });

  it("rejects invalid load inputs", () => {
    expect(() =>
      buildLoadPlan(
        schedule([price("2026-10-07T10:00:00+02:00", 1)]),
        { durationMinutes: 0, powerKw: 1 },
      ),
    ).toThrow(/durationMinutes/);

    expect(() =>
      buildLoadPlan(
        schedule([price("2026-10-07T10:00:00+02:00", 1)]),
        { durationMinutes: 60, powerKw: 0 },
      ),
    ).toThrow(/powerKw/);
  });
});
