export type EnergyPriceLevel =
  | "VERY_CHEAP"
  | "CHEAP"
  | "NORMAL"
  | "EXPENSIVE"
  | "VERY_EXPENSIVE"
  | null;

export type PriceSlot = Readonly<{
  total: number | null;
  energy: number | null;
  tax: number | null;
  startsAt: string | null;
  currency: string;
  level: EnergyPriceLevel;
}>;

export type EnergyHome = Readonly<{
  id: string;
  name?: string | null;
  timeZone?: string | null;
  type?: string | null;
  size?: number | null;
  residents?: number | null;
  primaryHeatingSource?: string | null;
  realtimeEnabled?: boolean | null;
  gridCompany?: string | null;
  gridAreaCode?: string | null;
  priceAreaCode?: string | null;
  estimatedAnnualConsumption?: number | null;
}>;

export type PriceSchedule = Readonly<{
  provider: string;
  homeId: string;
  current: PriceSlot | null;
  today: readonly PriceSlot[];
  tomorrow: readonly PriceSlot[];
}>;

export type ConsumptionSample = Readonly<{
  from: string;
  to: string;
  consumption: number | null;
  consumptionUnit: string | null;
  unitPrice: number | null;
  unitPriceVat: number | null;
  cost: number | null;
  currency: string | null;
}>;

export type ConsumptionReport = Readonly<{
  provider: string;
  homeId: string;
  samples: readonly ConsumptionSample[];
  count: number | null;
  totalConsumption: number | null;
  totalCost: number | null;
  currency: string | null;
}>;

export interface EnergyProvider {
  readonly id: string;
  homes(): Promise<readonly EnergyHome[]>;
  prices(homeId: string): Promise<PriceSchedule>;
  consumption(homeId: string, days: number): Promise<ConsumptionReport>;
}
