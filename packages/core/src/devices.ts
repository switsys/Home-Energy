export type EnergyDeviceKind =
  | "ev_charger"
  | "heater"
  | "water_heater"
  | "appliance"
  | "relay"
  | "smart_plug"
  | "other";

export type EnergyDevicePowerState = "on" | "off" | "unknown";

export type EnergyDevice = Readonly<{
  id: string;
  propertyId: string;
  gridConnectionId: string | null;
  providerScopeId: string | null;
  name: string;
  kind: EnergyDeviceKind;
  controllable: boolean;
  nominalPowerKw: number | null;
  powerState: EnergyDevicePowerState;
}>;

export interface EnergyDeviceProvider {
  readonly id: string;
  devices(propertyId: string): Promise<readonly EnergyDevice[]>;
  setPower?(
    propertyId: string,
    deviceId: string,
    on: boolean,
  ): Promise<EnergyDevice>;
}
