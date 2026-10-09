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
