import { describe, expect, it } from "vitest";
import type { EnergyProvider, PriceSchedule } from "@home-energy/core";
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
});
