import { describe, expect, it } from "vitest";
import {
  buildDeviceAutomationPreview,
  type EnergyDevice,
  type LoadPlan,
} from "../src/index.js";

const device: EnergyDevice = {
  id: "charger-1",
  propertyId: "li-erikes",
  gridConnectionId: "tibber:home-1",
  providerScopeId: "google-home-1",
  name: "Garage charger",
  kind: "ev_charger",
  controllable: true,
  nominalPowerKw: 7.4,
  powerState: "off",
};

const plan: LoadPlan = {
  provider: "test",
  homeId: "home-1",
  generatedAt: "2026-11-10T09:00:00.000Z",
  action: "wait",
  reason: "future_window_saves_meaningful_money",
  immediate: null,
  best: {
    startsAt: "2026-11-10T18:00:00.000Z",
    endsAt: "2026-11-10T19:00:00.000Z",
    durationMinutes: 60,
    powerKw: 7.4,
    energyKwh: 7.4,
    averagePrice: 1.1125,
    energyPriceCost: 7.4,
    gridTransferCost: 0.8325,
    estimatedCost: 8.2325,
    comparisonCost: 8.2325,
    currency: "SEK",
    grid: null,
  },
  savings: null,
  savingsPercent: null,
};

describe("buildDeviceAutomationPreview", () => {
  it("turns the best load-plan window into an approval-gated device schedule", () => {
    expect(buildDeviceAutomationPreview(plan, device)).toMatchObject({
      deviceId: "charger-1",
      action: "schedule",
      startsAt: "2026-11-10T18:00:00.000Z",
      endsAt: "2026-11-10T19:00:00.000Z",
      powerKw: 7.4,
      estimatedEnergyKwh: 7.4,
      variableCost: 8.2325,
      comparisonCost: 8.2325,
      controlAvailable: true,
      requiresApproval: true,
    });
  });

  it("rejects devices without a usable nominal power", () => {
    expect(() =>
      buildDeviceAutomationPreview(plan, {
        ...device,
        nominalPowerKw: null,
      }),
    ).toThrow(/nominalPowerKw/);
  });
});
