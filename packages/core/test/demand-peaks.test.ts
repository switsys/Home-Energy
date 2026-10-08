import { describe, expect, it } from "vitest";
import {
  buildDemandPeakReport,
  estimatePlannedDemandImpact,
  faluElnat2026,
  type ConsumptionSample,
} from "../src/index.js";

function sample(from: string, consumption: number): ConsumptionSample {
  const starts = new Date(from);
  const ends = new Date(starts.getTime() + 60 * 60 * 1000);
  return {
    from: starts.toISOString(),
    to: ends.toISOString(),
    consumption,
    consumptionUnit: "kWh",
    unitPrice: null,
    unitPriceVat: null,
    cost: null,
    currency: "SEK",
  };
}

describe("buildDemandPeakReport", () => {
  it("reports the Falu effect tariff as inactive outside Nov-Mar", () => {
    const report = buildDemandPeakReport(
      [sample("2026-10-08T08:00:00Z", 8)],
      faluElnat2026,
      new Date("2026-10-08T12:00:00+02:00"),
    );

    expect(report).toMatchObject({
      billingMonth: "2026-10",
      status: "inactive",
      demandRatePerKwMonth: 0,
      estimatedDemandCharge: null,
    });
  });

  it("uses the highest eligible hour from three different days", () => {
    const samples = [
      sample("2026-11-02T07:00:00Z", 4),
      sample("2026-11-02T10:00:00Z", 5),
      sample("2026-11-03T08:00:00Z", 7),
      sample("2026-11-04T09:00:00Z", 6),
      sample("2026-11-05T09:00:00Z", 3),
      sample("2026-11-07T09:00:00Z", 20),
    ];

    const report = buildDemandPeakReport(
      samples,
      faluElnat2026,
      new Date("2026-11-10T12:00:00+01:00"),
    );

    expect(report.status).toBe("estimated");
    expect(report.peakDays.map((peak) => peak.averageKw)).toEqual([7, 6, 5]);
    expect(report.trackedAveragePeakKw).toBe(6);
    expect(report.thresholdKw).toBe(5);
    expect(report.demandRatePerKwMonth).toBe(75);
    expect(report.estimatedDemandCharge).toBe(450);
  });

  it("stays partial until three eligible days are available", () => {
    const report = buildDemandPeakReport(
      [
        sample("2026-11-02T10:00:00+01:00", 5),
        sample("2026-11-03T10:00:00+01:00", 7),
      ],
      faluElnat2026,
      new Date("2026-11-03T18:00:00+01:00"),
    );

    expect(report.status).toBe("partial");
    expect(report.trackedAveragePeakKw).toBe(6);
    expect(report.thresholdKw).toBeNull();
    expect(report.estimatedDemandCharge).toBeNull();
  });
  it("estimates a minimum incremental charge when planned load alone raises the top three", () => {
    const report = buildDemandPeakReport(
      [
        sample("2026-11-02T10:00:00+01:00", 5),
        sample("2026-11-03T10:00:00+01:00", 7),
        sample("2026-11-04T10:00:00+01:00", 6),
      ],
      faluElnat2026,
      new Date("2026-11-10T12:00:00+01:00"),
    );

    const impact = estimatePlannedDemandImpact(report, [
      { date: "2026-11-10", averageKw: 8 },
    ]);

    expect(impact).toMatchObject({
      status: "definite",
      thresholdKw: 5,
      plannedPeakContributionKw: 8,
      currentEstimatedDemandCharge: 450,
      projectedMinimumDemandCharge: 525,
      minimumIncrementalDemandCharge: 75,
      demandRatePerKwMonth: 75,
    });
  });

  it("keeps active-period risk unknown when peak history is unavailable", () => {
    const impact = estimatePlannedDemandImpact(null, [
      { date: "2026-11-10", averageKw: 2 },
    ]);

    expect(impact).toMatchObject({
      status: "unknown",
      thresholdKw: null,
      plannedPeakContributionKw: 2,
      minimumIncrementalDemandCharge: null,
    });
  });
});
