import { describe, expect, it } from "vitest";
import {
  buildLoadPlan,
  faluElnat2026,
  type DemandPeakReport,
  type PriceSchedule,
  type PriceSlot,
} from "../src/index.js";

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

  it("avoids a cheap window when the planned load alone would raise the monthly peak charge", () => {
    const prices = [
      price("2026-11-10T10:00:00+01:00", 0.1),
      price("2026-11-10T10:15:00+01:00", 0.1),
      price("2026-11-10T10:30:00+01:00", 0.1),
      price("2026-11-10T10:45:00+01:00", 0.1),
      price("2026-11-10T19:00:00+01:00", 1.0),
      price("2026-11-10T19:15:00+01:00", 1.0),
      price("2026-11-10T19:30:00+01:00", 1.0),
      price("2026-11-10T19:45:00+01:00", 1.0),
    ];
    const demandPeaks: DemandPeakReport = {
      tariffId: "falu-elnat-2026",
      label: "Falu Elnät 2026",
      currency: "SEK",
      generatedAt: "2026-11-10T09:00:00.000Z",
      billingMonth: "2026-11",
      status: "estimated",
      demandRatePerKwMonth: 75,
      requiredPeakDays: 3,
      eligibleHours: 30,
      peakDays: [
        { date: "2026-11-03", startsAt: "2026-11-03T08:00:00.000Z", averageKw: 7 },
        { date: "2026-11-04", startsAt: "2026-11-04T08:00:00.000Z", averageKw: 6 },
        { date: "2026-11-02", startsAt: "2026-11-02T08:00:00.000Z", averageKw: 5 },
      ],
      trackedAveragePeakKw: 6,
      thresholdKw: 5,
      estimatedDemandCharge: 450,
    };

    const plan = buildLoadPlan(
      schedule(prices),
      { durationMinutes: 60, powerKw: 8 },
      new Date("2026-11-10T10:00:00+01:00"),
      faluElnat2026,
      demandPeaks,
    );

    expect(plan.action).toBe("wait");
    expect(plan.immediate?.grid?.demandImpact).toMatchObject({
      status: "definite",
      thresholdKw: 5,
      plannedPeakContributionKw: 8,
      minimumIncrementalDemandCharge: 75,
    });
    expect(plan.immediate?.comparisonCost).toBe(76.7);
    expect(plan.best.startsAt).toBe("2026-11-10T18:00:00.000Z");
    expect(plan.best.grid?.demandImpact.status).toBe("none");
    expect(plan.best.comparisonCost).toBe(8.9);
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
