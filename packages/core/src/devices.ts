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
  homeId: string;
  name: string;
  kind: EnergyDeviceKind;
  controllable: boolean;
  nominalPowerKw: number | null;
  powerState: EnergyDevicePowerState;
}>;

export interface EnergyDeviceProvider {
  readonly id: string;
  devices(homeId: string): Promise<readonly EnergyDevice[]>;
  setPower?(
    homeId: string,
    deviceId: string,
    on: boolean,
  ): Promise<EnergyDevice>;
}
