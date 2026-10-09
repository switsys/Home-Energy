import { describe, expect, it } from "vitest";
import {
  buildEnergyProperty,
  faluElnat2026,
  type EnergyDeviceProvider,
  type EnergyProvider,
  type HomeDeviceGateway,
  type PriceSchedule,
} from "@home-energy/core";
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
      deviceGateway: null,
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

  it("groups two provider homes into one property with separate grid billing scopes", async () => {
    const multiHomeProvider: EnergyProvider = {
      ...provider,
      homes: async () => [
        {
          id: "home-1",
          name: "Li-Erikes Gård",
          timeZone: "Europe/Stockholm",
          gridCompany: "Falu Elnät AB",
          gridAreaCode: "FLN",
          priceAreaCode: "SE3",
        },
        {
          id: "home-2",
          name: "Hus2/3",
          timeZone: "Europe/Stockholm",
          gridCompany: "Falu Elnät AB",
          gridAreaCode: "FLN",
          priceAreaCode: "SE3",
        },
      ],
    };
    const property = buildEnergyProperty({
      id: "li-erikes",
      name: "Li-Erikes Gård",
      providerId: "fake",
      homes: await multiHomeProvider.homes(),
      gridTariffId: "falu-elnat-2026",
    });
    const app = buildApp({
      provider: multiHomeProvider,
      apiKey: "secret",
      property,
      gridTariff: faluElnat2026,
    });

    const response = await app.inject({
      headers: { "x-home-energy-key": "secret" },
      method: "GET",
      url: "/api/energy/property",
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      id: "li-erikes",
      name: "Li-Erikes Gård",
      gridConnections: [
        {
          id: "fake:home-1",
          providerHomeId: "home-1",
          billingScopeId: "fake:home-1",
        },
        {
          id: "fake:home-2",
          providerHomeId: "home-2",
          billingScopeId: "fake:home-2",
        },
      ],
    });
  });

  it("aggregates consumption across both grid connections without collapsing their identities", async () => {
    const multiHomeProvider: EnergyProvider = {
      ...provider,
      homes: async () => [
        { id: "home-1", name: "Li-Erikes Gård" },
        { id: "home-2", name: "Hus2/3" },
      ],
      consumption: async (homeId, days) => ({
        provider: "fake",
        homeId,
        samples: [],
        count: days,
        totalConsumption: homeId === "home-1" ? 42 : 18,
        totalCost: homeId === "home-1" ? 84 : 36,
        currency: "SEK",
      }),
    };
    const property = buildEnergyProperty({
      id: "li-erikes",
      name: "Li-Erikes Gård",
      providerId: "fake",
      homes: await multiHomeProvider.homes(),
    });
    const app = buildApp({
      provider: multiHomeProvider,
      apiKey: "secret",
      property,
    });

    const response = await app.inject({
      headers: { "x-home-energy-key": "secret" },
      method: "GET",
      url: "/api/energy/property/consumption?days=7",
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      propertyId: "li-erikes",
      days: 7,
      gridConnectionCount: 2,
      totalConsumption: 60,
      totalCost: 120,
      currency: "SEK",
      connections: [
        {
          gridConnectionId: "fake:home-1",
          totalConsumption: 42,
          totalCost: 84,
        },
        {
          gridConnectionId: "fake:home-2",
          totalConsumption: 18,
          totalCost: 36,
        },
      ],
    });
  });

  it("keeps effect-charge peak histories separate for both grid connections", async () => {
    const sample = (homeId: string, day: string, consumption: number) => ({
      from: `2026-11-${day}T09:00:00+01:00`,
      to: `2026-11-${day}T10:00:00+01:00`,
      consumption,
      consumptionUnit: "kWh",
      unitPrice: null,
      unitPriceVat: null,
      cost: null,
      currency: "SEK",
    });
    const multiHomeProvider: EnergyProvider = {
      ...provider,
      homes: async () => [
        { id: "home-1", name: "Li-Erikes Gård" },
        { id: "home-2", name: "Hus2/3" },
      ],
      hourlyConsumption: async (homeId) => {
        const values = homeId === "home-1" ? [5, 7, 6] : [2, 4, 3];
        return {
          provider: "fake",
          homeId,
          samples: [
            sample(homeId, "02", values[0] ?? 0),
            sample(homeId, "03", values[1] ?? 0),
            sample(homeId, "04", values[2] ?? 0),
          ],
          count: 3,
          totalConsumption: values.reduce((sum, value) => sum + value, 0),
          totalCost: null,
          currency: "SEK",
        };
      },
    };
    const property = buildEnergyProperty({
      id: "li-erikes",
      name: "Li-Erikes Gård",
      providerId: "fake",
      homes: await multiHomeProvider.homes(),
      gridTariffId: "falu-elnat-2026",
    });
    const app = buildApp({
      provider: multiHomeProvider,
      apiKey: "secret",
      property,
      gridTariff: faluElnat2026,
      clock: () => new Date("2026-11-10T12:00:00+01:00"),
    });

    const response = await app.inject({
      headers: { "x-home-energy-key": "secret" },
      method: "GET",
      url: "/api/energy/property/grid-peaks",
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      propertyId: "li-erikes",
      billingMode: "per_connection",
      currency: "SEK",
      estimatedDemandChargeTotal: 675,
      connections: [
        {
          gridConnectionId: "fake:home-1",
          billingScopeId: "fake:home-1",
          trackedAveragePeakKw: 6,
          estimatedDemandCharge: 450,
        },
        {
          gridConnectionId: "fake:home-2",
          billingScopeId: "fake:home-2",
          trackedAveragePeakKw: 3,
          estimatedDemandCharge: 225,
        },
      ],
    });
  });

  it("plans device automation against the grid connection mapped to that device", async () => {
    const prices: PriceSchedule["today"] = [
      "10:00",
      "10:15",
      "10:30",
      "10:45",
    ].map((time) => ({
      total: 0.5,
      energy: 0.5,
      tax: 0,
      startsAt: `2026-10-09T${time}:00+02:00`,
      currency: "SEK",
      level: "CHEAP" as const,
    }));
    const multiHomeProvider: EnergyProvider = {
      ...provider,
      homes: async () => [
        { id: "home-1", name: "Li-Erikes Gård" },
        { id: "home-2", name: "Hus2/3" },
      ],
      prices: async (homeId) => ({
        provider: "fake",
        homeId,
        current: prices[0] ?? null,
        today: prices,
        tomorrow: [],
      }),
    };
    const property = buildEnergyProperty({
      id: "li-erikes",
      name: "Li-Erikes Gård",
      providerId: "fake",
      homes: await multiHomeProvider.homes(),
      gridTariffId: "falu-elnat-2026",
    });
    const deviceProvider: EnergyDeviceProvider = {
      id: "google-home",
      devices: async (propertyId) => [
        {
          id: "heater-1",
          propertyId,
          gridConnectionId: "fake:home-2",
          providerScopeId: "google-home-li-erikes",
          name: "Workshop heater",
          kind: "heater",
          controllable: true,
          nominalPowerKw: 1.5,
          powerState: "off",
        },
      ],
    };
    const app = buildApp({
      provider: multiHomeProvider,
      deviceProvider,
      property,
      apiKey: "secret",
      gridTariff: faluElnat2026,
      clock: () => new Date("2026-10-09T10:00:00+02:00"),
    });

    const response = await app.inject({
      headers: {
        "content-type": "application/json",
        "x-home-energy-key": "secret",
      },
      method: "POST",
      url: "/api/energy/automation/preview",
      payload: {
        deviceId: "heater-1",
        minutes: 60,
      },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      provider: "google-home",
      propertyId: "li-erikes",
      gridConnectionId: "fake:home-2",
      homeId: "home-2",
      automation: {
        deviceId: "heater-1",
        requiresApproval: true,
        controlAvailable: true,
        powerKw: 1.5,
      },
    });
  });

  it("exposes a configured home device gateway and executes commands", async () => {
    let received:
      | Readonly<{
          deviceId: string;
          trait: string;
          command: string;
        }>
      | null = null;

    const deviceGateway: HomeDeviceGateway = {
      id: "google-home",
      devices: async () => [
        {
          id: "plug-1",
          source: "google-home",
          name: "Workshop plug",
          room: "Workshop",
          type: "on-off-plugin-unit",
          traits: ["on-off"],
          online: true,
        },
      ],
      state: async (deviceId) =>
        deviceId === "plug-1"
          ? {
              deviceId,
              observedAt: "2026-10-09T08:00:00.000Z",
              values: { on: false },
            }
          : null,
      execute: async (command) => {
        received = {
          deviceId: command.deviceId,
          trait: command.trait,
          command: command.command,
        };
        return {
          deviceId: command.deviceId,
          accepted: true,
          completedAt: "2026-10-09T08:00:01.000Z",
        };
      },
    };

    const app = buildApp({
      provider,
      apiKey: "secret",
      defaultHomeId: "home-1",
      deviceGateway,
    });

    const devices = await app.inject({
      headers: { "x-home-energy-key": "secret" },
      method: "GET",
      url: "/api/home/devices",
    });
    expect(devices.statusCode).toBe(200);
    expect(devices.json()).toMatchObject({
      gateway: "google-home",
      devices: [{ id: "plug-1", name: "Workshop plug" }],
    });

    const state = await app.inject({
      headers: { "x-home-energy-key": "secret" },
      method: "GET",
      url: "/api/home/devices/plug-1/state",
    });
    expect(state.statusCode).toBe(200);
    expect(state.json()).toMatchObject({
      deviceId: "plug-1",
      values: { on: false },
    });

    const command = await app.inject({
      headers: {
        "content-type": "application/json",
        "x-home-energy-key": "secret",
      },
      method: "POST",
      url: "/api/home/devices/plug-1/commands",
      payload: {
        trait: "on-off",
        command: "on",
      },
    });
    expect(command.statusCode).toBe(200);
    expect(command.json()).toMatchObject({
      deviceId: "plug-1",
      accepted: true,
    });
    expect(received).toEqual({
      deviceId: "plug-1",
      trait: "on-off",
      command: "on",
    });
  });

  it("returns 501 when no home device gateway is configured", async () => {
    const app = buildApp({ provider, apiKey: "secret" });
    const response = await app.inject({
      headers: { "x-home-energy-key": "secret" },
      method: "GET",
      url: "/api/home/devices",
    });

    expect(response.statusCode).toBe(501);
    expect(response.json()).toMatchObject({
      error: "device_gateway_not_configured",
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
