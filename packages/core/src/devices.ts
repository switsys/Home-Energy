export type DeviceSource = "google-home" | "matter" | "local" | string;

export type HomeDevice = Readonly<{
  id: string;
  source: DeviceSource;
  name: string;
  room?: string | null;
  type: string;
  traits: readonly string[];
  online?: boolean | null;
}>;

export type DeviceStateValue =
  | boolean
  | number
  | string
  | null
  | readonly DeviceStateValue[]
  | Readonly<{ [key: string]: DeviceStateValue }>;

export type HomeDeviceState = Readonly<{
  deviceId: string;
  observedAt: string;
  values: Readonly<Record<string, DeviceStateValue>>;
}>;

export type HomeDeviceCommand = Readonly<{
  deviceId: string;
  trait: string;
  command: string;
  params?: Readonly<Record<string, DeviceStateValue>>;
}>;

export type HomeDeviceCommandResult = Readonly<{
  deviceId: string;
  accepted: boolean;
  completedAt?: string | null;
  message?: string | null;
}>;

export interface HomeDeviceGateway {
  readonly id: string;
  devices(): Promise<readonly HomeDevice[]>;
  state(deviceId: string): Promise<HomeDeviceState | null>;
  execute(command: HomeDeviceCommand): Promise<HomeDeviceCommandResult>;
}

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
