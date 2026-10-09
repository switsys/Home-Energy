import type { PlannedDemandImpact } from "./demand-peaks.js";
import type { EnergyDevice } from "./devices.js";
import type { LoadPlan } from "./planner.js";

export type DeviceAutomationPreview = Readonly<{
  deviceId: string;
  deviceName: string;
  deviceKind: EnergyDevice["kind"];
  action: "run_now" | "schedule";
  startsAt: string;
  endsAt: string;
  durationMinutes: number;
  powerKw: number;
  estimatedEnergyKwh: number;
  variableCost: number;
  comparisonCost: number;
  currency: string;
  demandImpact: PlannedDemandImpact | null;
  controlAvailable: boolean;
  requiresApproval: true;
}>;

export function buildDeviceAutomationPreview(
  plan: LoadPlan,
  device: EnergyDevice,
): DeviceAutomationPreview {
  if (
    device.nominalPowerKw === null ||
    !Number.isFinite(device.nominalPowerKw) ||
    device.nominalPowerKw <= 0
  ) {
    throw new Error("Device nominalPowerKw must be configured before planning automation");
  }

  const window = plan.best;

  return {
    deviceId: device.id,
    deviceName: device.name,
    deviceKind: device.kind,
    action: plan.action === "run_now" ? "run_now" : "schedule",
    startsAt: window.startsAt,
    endsAt: window.endsAt,
    durationMinutes: window.durationMinutes,
    powerKw: window.powerKw,
    estimatedEnergyKwh: window.energyKwh,
    variableCost: window.estimatedCost,
    comparisonCost: window.comparisonCost,
    currency: window.currency,
    demandImpact: window.grid?.demandImpact ?? null,
    controlAvailable: device.controllable,
    requiresApproval: true,
  };
}
