import { describe, expect, it } from "vitest";
import { faluElnat2026, type EnergyProvider, type PriceSchedule } from "@home-energy/core";
import { buildApp } from "../src/app.js";

const schedule: PriceSchedule = {
  provider: "fake",
  homeId: "home-1",
  current: {
    total: 0.25,
    energy: 0.15,
    tax: 0.1,
    startsAt: "2026-10-06T14:00:00+02:00",
    currency: "SEK",
    level: "CHEAP",
  },
  today: [],
  tomorrow: [],
};

const provider: EnergyProvider = {
  id: "fake",
  homes: async () => [{ id: "home-1", name: "Home" }],
  prices: async () => schedule,
  consumption: async (homeId, days) => ({
    provider: "fake",
    homeId,
    samples: [],
    count: days,
    totalConsumption: 0,
    totalCost: 0,
    currency: "SEK",
  }),
};

describe("Home-Energy API", () => {
  it("reports configured provider without exposing secrets", async () => {
    const response = await buildApp({ provider, apiKey: "secret" }).inject({
      method: "GET",
      url: "/api/energy/status",
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      configured: true,
      protected: true,
      provider: "fake",
      gridTariff: null,
    });
  });

  it("protects account data", async () => {
    const app = buildApp({ provider, apiKey: "secret", defaultHomeId: "home-1" });

    const denied = await app.inject({
      method: "GET",
      url: "/api/energy/prices",
    });
    expect(denied.statusCode).toBe(401);

    const allowed = await app.inject({
      headers: { "x-home-energy-key": "secret" },
      method: "GET",
      url: "/api/energy/prices",
    });
    expect(allowed.statusCode).toBe(200);
    expect(allowed.json()).toMatchObject({ provider: "fake", homeId: "home-1" });
  });
  it("plans a load without exposing the provider credential", async () => {
    const today: PriceSchedule["today"] = [
      {
        total: 2,
        energy: 2,
        tax: 0,
        startsAt: "2026-10-07T10:00:00+02:00",
        currency: "SEK",
        level: "EXPENSIVE",
      },
      {
        total: 2,
        energy: 2,
        tax: 0,
        startsAt: "2026-10-07T10:15:00+02:00",
        currency: "SEK",
        level: "EXPENSIVE",
      },
      ...["10:30", "10:45", "11:00", "11:15"].map((time) => ({
        total: 0.5,
        energy: 0.5,
        tax: 0,
        startsAt: `2026-10-07T${time}:00+02:00`,
        currency: "SEK",
        level: "CHEAP" as const,
      })),
    ];
    const plannerSchedule: PriceSchedule = {
      provider: "fake",
      homeId: "home-1",
      current: today[0],
      today,
      tomorrow: [],
    };
    const plannerProvider: EnergyProvider = {
      ...provider,
      prices: async () => plannerSchedule,
    };
    const app = buildApp({
      provider: plannerProvider,
      apiKey: "secret",
      defaultHomeId: "home-1",
      clock: () => new Date("2026-10-07T10:00:00+02:00"),
    });

    const response = await app.inject({
      headers: { "x-home-energy-key": "secret" },
      method: "GET",
      url: "/api/energy/load-plan?minutes=60&powerKw=2",
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      action: "wait",
      best: {
        startsAt: "2026-10-07T08:30:00.000Z",
        estimatedCost: 1,
      },
      savings: 1.5,
    });
  });

  it("applies a configured grid tariff to the load plan", async () => {
    const today: PriceSchedule["today"] = [
      {
        total: 1,
        energy: 1,
        tax: 0,
        startsAt: "2026-10-08T12:00:00+02:00",
        currency: "SEK",
        level: "NORMAL",
      },
      {
        total: 1,
        energy: 1,
        tax: 0,
        startsAt: "2026-10-08T12:15:00+02:00",
        currency: "SEK",
        level: "NORMAL",
      },
      {
        total: 1,
        energy: 1,
        tax: 0,
        startsAt: "2026-10-08T12:30:00+02:00",
        currency: "SEK",
        level: "NORMAL",
      },
      {
        total: 1,
        energy: 1,
        tax: 0,
        startsAt: "2026-10-08T12:45:00+02:00",
        currency: "SEK",
        level: "NORMAL",
      },
    ];
    const tariffProvider: EnergyProvider = {
      ...provider,
      prices: async () => ({
        provider: "fake",
        homeId: "home-1",
        current: today[0],
        today,
        tomorrow: [],
      }),
    };
    const app = buildApp({
      provider: tariffProvider,
      apiKey: "secret",
      defaultHomeId: "home-1",
      gridTariff: faluElnat2026,
      clock: () => new Date("2026-10-08T12:00:00+02:00"),
    });

    const response = await app.inject({
      headers: { "x-home-energy-key": "secret" },
      method: "GET",
      url: "/api/energy/load-plan?minutes=60&powerKw=2",
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      best: {
        energyPriceCost: 2,
        gridTransferCost: 0.225,
        estimatedCost: 2.225,
        grid: {
          tariffId: "falu-elnat-2026",
          highestDemandRatePerKwMonth: 0,
          demandChargeIncludedInEstimatedCost: false,
        },
      },
    });
  });

  it("reports current Falu grid demand peaks from hourly consumption", async () => {
    const peakProvider: EnergyProvider = {
      ...provider,
      hourlyConsumption: async (homeId) => ({
        provider: "fake",
        homeId,
        samples: [
          {
            from: "2026-11-02T09:00:00+01:00",
            to: "2026-11-02T10:00:00+01:00",
            consumption: 5,
            consumptionUnit: "kWh",
            unitPrice: null,
            unitPriceVat: null,
            cost: null,
            currency: "SEK",
          },
          {
            from: "2026-11-03T09:00:00+01:00",
            to: "2026-11-03T10:00:00+01:00",
            consumption: 7,
            consumptionUnit: "kWh",
            unitPrice: null,
            unitPriceVat: null,
            cost: null,
            currency: "SEK",
          },
          {
            from: "2026-11-04T09:00:00+01:00",
            to: "2026-11-04T10:00:00+01:00",
            consumption: 6,
            consumptionUnit: "kWh",
            unitPrice: null,
            unitPriceVat: null,
            cost: null,
            currency: "SEK",
          },
        ],
        count: 3,
        totalConsumption: 18,
        totalCost: null,
        currency: "SEK",
      }),
    };
    const app = buildApp({
      provider: peakProvider,
      apiKey: "secret",
      defaultHomeId: "home-1",
      gridTariff: faluElnat2026,
      clock: () => new Date("2026-11-10T12:00:00+01:00"),
    });

    const response = await app.inject({
      headers: { "x-home-energy-key": "secret" },
      method: "GET",
      url: "/api/energy/grid-peaks",
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      provider: "fake",
      homeId: "home-1",
      status: "estimated",
      trackedAveragePeakKw: 6,
      thresholdKw: 5,
      demandRatePerKwMonth: 75,
      estimatedDemandCharge: 450,
    });
  });

  it("uses current peak history to avoid a definite effect-charge increase", async () => {
    const today: PriceSchedule["today"] = [
      ...["10:00", "10:15", "10:30", "10:45"].map((time) => ({
        total: 0.1,
        energy: 0.1,
        tax: 0,
        startsAt: `2026-11-10T${time}:00+01:00`,
        currency: "SEK",
        level: "VERY_CHEAP" as const,
      })),
      ...["19:00", "19:15", "19:30", "19:45"].map((time) => ({
        total: 1,
        energy: 1,
        tax: 0,
        startsAt: `2026-11-10T${time}:00+01:00`,
        currency: "SEK",
        level: "NORMAL" as const,
      })),
    ];
    const peakAwareProvider: EnergyProvider = {
      ...provider,
      prices: async () => ({
        provider: "fake",
        homeId: "home-1",
        current: today[0],
        today,
        tomorrow: [],
      }),
      hourlyConsumption: async (homeId) => ({
        provider: "fake",
        homeId,
        samples: [
          {
            from: "2026-11-02T09:00:00+01:00",
            to: "2026-11-02T10:00:00+01:00",
            consumption: 5,
            consumptionUnit: "kWh",
            unitPrice: null,
            unitPriceVat: null,
            cost: null,
            currency: "SEK",
          },
          {
            from: "2026-11-03T09:00:00+01:00",
            to: "2026-11-03T10:00:00+01:00",
            consumption: 7,
            consumptionUnit: "kWh",
            unitPrice: null,
            unitPriceVat: null,
            cost: null,
            currency: "SEK",
          },
          {
            from: "2026-11-04T09:00:00+01:00",
            to: "2026-11-04T10:00:00+01:00",
            consumption: 6,
            consumptionUnit: "kWh",
            unitPrice: null,
            unitPriceVat: null,
            cost: null,
            currency: "SEK",
          },
        ],
        count: 3,
        totalConsumption: 18,
        totalCost: null,
        currency: "SEK",
      }),
    };
    const app = buildApp({
      provider: peakAwareProvider,
      apiKey: "secret",
      defaultHomeId: "home-1",
      gridTariff: faluElnat2026,
      clock: () => new Date("2026-11-10T10:00:00+01:00"),
    });

    const response = await app.inject({
      headers: { "x-home-energy-key": "secret" },
      method: "GET",
      url: "/api/energy/load-plan?minutes=60&powerKw=8",
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      action: "wait",
      immediate: {
        comparisonCost: 76.7,
        grid: {
          demandImpact: {
            status: "definite",
            thresholdKw: 5,
            minimumIncrementalDemandCharge: 75,
          },
        },
      },
      best: {
        startsAt: "2026-11-10T18:00:00.000Z",
        comparisonCost: 8.9,
        grid: {
          demandImpact: {
            status: "none",
            minimumIncrementalDemandCharge: 0,
          },
        },
      },
    });
  });

  it("validates load planner inputs", async () => {
    const app = buildApp({ provider, apiKey: "secret", defaultHomeId: "home-1" });
    const response = await app.inject({
      headers: { "x-home-energy-key": "secret" },
      method: "GET",
      url: "/api/energy/load-plan?minutes=0&powerKw=2",
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ error: "invalid_minutes" });
  });

});
