import type {
  ConsumptionReport,
  EnergyHome,
  EnergyProvider,
  PriceSchedule,
  PriceSlot,
} from "@home-energy/core";

const DEFAULT_TIBBER_ENDPOINT = "https://api.tibber.com/v1-beta/gql";

type TibberFetch = (
  input: string | URL,
  init?: RequestInit,
) => Promise<Response>;

type RawPrice = Readonly<{
  total: number | null;
  energy: number | null;
  tax: number | null;
  startsAt: string | null;
  currency: string;
  level:
    | "VERY_CHEAP"
    | "CHEAP"
    | "NORMAL"
    | "EXPENSIVE"
    | "VERY_EXPENSIVE"
    | null;
}>;

type GraphQlEnvelope<T> = Readonly<{
  data?: T;
  errors?: readonly Readonly<{ message?: string }>[];
}>;

export class TibberApiError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TibberApiError";
  }
}

export type TibberProviderOptions = Readonly<{
  token: string;
  endpoint?: string;
  fetch?: TibberFetch;
}>;

function mapPrice(price: RawPrice): PriceSlot {
  return price;
}

export class TibberProvider implements EnergyProvider {
  readonly id = "tibber";
  private readonly endpoint: string;
  private readonly fetchImpl: TibberFetch;
  private readonly token: string;

  constructor(options: TibberProviderOptions) {
    const token = options.token.trim();
    if (token.length === 0) throw new TibberApiError("Tibber token is empty");

    this.token = token;
    this.endpoint = options.endpoint ?? DEFAULT_TIBBER_ENDPOINT;
    this.fetchImpl = options.fetch ?? fetch;
  }

  private async query<T>(
    query: string,
    variables: Readonly<Record<string, unknown>> = {},
  ): Promise<T> {
    const response = await this.fetchImpl(this.endpoint, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.token}`,
        "Content-Type": "application/json",
        "User-Agent": "home-energy/0.1",
      },
      body: JSON.stringify({ query, variables }),
    });

    if (!response.ok) {
      throw new TibberApiError(
        `Tibber request failed with HTTP ${response.status}`,
      );
    }

    const payload = (await response.json()) as GraphQlEnvelope<T>;
    if (payload.errors !== undefined && payload.errors.length > 0) {
      const message = payload.errors
        .map((error) => error.message ?? "Unknown GraphQL error")
        .join("; ");
      throw new TibberApiError(`Tibber GraphQL error: ${message}`);
    }
    if (payload.data === undefined) {
      throw new TibberApiError("Tibber response did not contain data");
    }

    return payload.data;
  }

  async homes(): Promise<readonly EnergyHome[]> {
    const data = await this.query<{
      viewer: {
        homes: readonly Readonly<{
          id: string;
          appNickname?: string | null;
          timeZone?: string | null;
          type?: string | null;
          size?: number | null;
          numberOfResidents?: number | null;
          primaryHeatingSource?: string | null;
          features?: Readonly<{
            realTimeConsumptionEnabled?: boolean | null;
          }> | null;
          meteringPointData?: Readonly<{
            gridCompany?: string | null;
            gridAreaCode?: string | null;
            priceAreaCode?: string | null;
            estimatedAnnualConsumption?: number | null;
          }> | null;
        }>[];
      };
    }>(`
      query Homes {
        viewer {
          homes {
            id
            appNickname
            timeZone
            type
            size
            numberOfResidents
            primaryHeatingSource
            features { realTimeConsumptionEnabled }
            meteringPointData {
              gridCompany
              gridAreaCode
              priceAreaCode
              estimatedAnnualConsumption
            }
          }
        }
      }
    `);

    return data.viewer.homes.map((home) => ({
      id: home.id,
      name: home.appNickname,
      timeZone: home.timeZone,
      type: home.type,
      size: home.size,
      residents: home.numberOfResidents,
      primaryHeatingSource: home.primaryHeatingSource,
      realtimeEnabled: home.features?.realTimeConsumptionEnabled,
      gridCompany: home.meteringPointData?.gridCompany,
      gridAreaCode: home.meteringPointData?.gridAreaCode,
      priceAreaCode: home.meteringPointData?.priceAreaCode,
      estimatedAnnualConsumption:
        home.meteringPointData?.estimatedAnnualConsumption,
    }));
  }

  async prices(homeId: string): Promise<PriceSchedule> {
    const data = await this.query<{
      viewer: {
        home: Readonly<{
          id: string;
          currentSubscription: Readonly<{
            priceInfo: Readonly<{
              current: RawPrice | null;
              today: readonly RawPrice[];
              tomorrow: readonly RawPrice[];
            }> | null;
          }> | null;
        }>;
      };
    }>(
      `
        query Prices($homeId: ID!) {
          viewer {
            home(id: $homeId) {
              id
              currentSubscription {
                priceInfo(resolution: QUARTER_HOURLY) {
                  current { total energy tax startsAt currency level }
                  today { total energy tax startsAt currency level }
                  tomorrow { total energy tax startsAt currency level }
                }
              }
            }
          }
        }
      `,
      { homeId },
    );

    const info = data.viewer.home.currentSubscription?.priceInfo;
    return {
      provider: this.id,
      homeId: data.viewer.home.id,
      current: info?.current ? mapPrice(info.current) : null,
      today: info?.today.map(mapPrice) ?? [],
      tomorrow: info?.tomorrow.map(mapPrice) ?? [],
    };
  }

  async hourlyConsumption(
    homeId: string,
    hours: number,
  ): Promise<ConsumptionReport> {
    if (!Number.isInteger(hours) || hours < 1 || hours > 31 * 24) {
      throw new RangeError("Tibber hourly consumption supports 1 to 744 hours");
    }

    const data = await this.query<{
      viewer: {
        home: Readonly<{
          id: string;
          consumption: Readonly<{
            nodes:
              | readonly Readonly<{
                  from: string;
                  to: string;
                  consumption: number | null;
                  consumptionUnit: string | null;
                  unitPrice: number | null;
                  unitPriceVAT: number | null;
                  cost: number | null;
                  currency: string | null;
                }>[]
              | null;
            pageInfo: Readonly<{
              count: number | null;
              totalConsumption: number | null;
              totalCost: number | null;
              currency: string | null;
            }>;
          }> | null;
        }>;
      };
    }>(
      `
        query HourlyConsumption($homeId: ID!, $hours: Int!) {
          viewer {
            home(id: $homeId) {
              id
              consumption(
                resolution: HOURLY
                last: $hours
                filterEmptyNodes: true
              ) {
                nodes {
                  from
                  to
                  consumption
                  consumptionUnit
                  unitPrice
                  unitPriceVAT
                  cost
                  currency
                }
                pageInfo {
                  count
                  totalConsumption
                  totalCost
                  currency
                }
              }
            }
          }
        }
      `,
      { homeId, hours },
    );

    const report = data.viewer.home.consumption;
    return {
      provider: this.id,
      homeId: data.viewer.home.id,
      samples:
        report?.nodes?.map((node) => ({
          from: node.from,
          to: node.to,
          consumption: node.consumption,
          consumptionUnit: node.consumptionUnit,
          unitPrice: node.unitPrice,
          unitPriceVat: node.unitPriceVAT,
          cost: node.cost,
          currency: node.currency,
        })) ?? [],
      count: report?.pageInfo.count ?? null,
      totalConsumption: report?.pageInfo.totalConsumption ?? null,
      totalCost: report?.pageInfo.totalCost ?? null,
      currency: report?.pageInfo.currency ?? null,
    };
  }

  async consumption(homeId: string, days: number): Promise<ConsumptionReport> {
    if (!Number.isInteger(days) || days < 1 || days > 31) {
      throw new RangeError("Tibber daily consumption supports 1 to 31 days");
    }

    const data = await this.query<{
      viewer: {
        home: Readonly<{
          id: string;
          consumption: Readonly<{
            nodes:
              | readonly Readonly<{
                  from: string;
                  to: string;
                  consumption: number | null;
                  consumptionUnit: string | null;
                  unitPrice: number | null;
                  unitPriceVAT: number | null;
                  cost: number | null;
                  currency: string | null;
                }>[]
              | null;
            pageInfo: Readonly<{
              count: number | null;
              totalConsumption: number | null;
              totalCost: number | null;
              currency: string | null;
            }>;
          }> | null;
        }>;
      };
    }>(
      `
        query Consumption($homeId: ID!, $days: Int!) {
          viewer {
            home(id: $homeId) {
              id
              consumption(
                resolution: DAILY
                last: $days
                filterEmptyNodes: true
              ) {
                nodes {
                  from
                  to
                  consumption
                  consumptionUnit
                  unitPrice
                  unitPriceVAT
                  cost
                  currency
                }
                pageInfo {
                  count
                  totalConsumption
                  totalCost
                  currency
                }
              }
            }
          }
        }
      `,
      { homeId, days },
    );

    const report = data.viewer.home.consumption;
    return {
      provider: this.id,
      homeId: data.viewer.home.id,
      samples:
        report?.nodes?.map((node) => ({
          from: node.from,
          to: node.to,
          consumption: node.consumption,
          consumptionUnit: node.consumptionUnit,
          unitPrice: node.unitPrice,
          unitPriceVat: node.unitPriceVAT,
          cost: node.cost,
          currency: node.currency,
        })) ?? [],
      count: report?.pageInfo.count ?? null,
      totalConsumption: report?.pageInfo.totalConsumption ?? null,
      totalCost: report?.pageInfo.totalCost ?? null,
      currency: report?.pageInfo.currency ?? null,
    };
  }
}
