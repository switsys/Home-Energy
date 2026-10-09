import type { EnergyHome } from "./contracts.js";

export type GridConnection = Readonly<{
  id: string;
  propertyId: string;
  name: string;
  providerId: string;
  providerHomeId: string;
  billingScopeId: string;
  gridTariffId: string | null;
  gridCompany: string | null;
  gridAreaCode: string | null;
  priceAreaCode: string | null;
}>;

export type EnergyProperty = Readonly<{
  id: string;
  name: string;
  timeZone: string | null;
  gridConnections: readonly GridConnection[];
}>;

export type EnergyPropertyInput = Readonly<{
  id: string;
  name: string;
  timeZone?: string | null;
  providerId: string;
  homes: readonly EnergyHome[];
  gridTariffId?: string | null;
}>;

function connectionId(providerId: string, homeId: string): string {
  return `${providerId}:${homeId}`;
}

export function buildEnergyProperty(input: EnergyPropertyInput): EnergyProperty {
  const propertyId = input.id.trim();
  const name = input.name.trim();
  const providerId = input.providerId.trim();

  if (propertyId.length === 0) throw new Error("Property id is required");
  if (name.length === 0) throw new Error("Property name is required");
  if (providerId.length === 0) throw new Error("Provider id is required");

  const seenHomes = new Set<string>();
  const gridConnections = input.homes.map((home) => {
    if (seenHomes.has(home.id)) {
      throw new Error(`Duplicate provider home id: ${home.id}`);
    }
    seenHomes.add(home.id);

    const id = connectionId(providerId, home.id);
    return {
      id,
      propertyId,
      name: home.name?.trim() || id,
      providerId,
      providerHomeId: home.id,
      billingScopeId: id,
      gridTariffId: input.gridTariffId ?? null,
      gridCompany: home.gridCompany ?? null,
      gridAreaCode: home.gridAreaCode ?? null,
      priceAreaCode: home.priceAreaCode ?? null,
    };
  });

  return {
    id: propertyId,
    name,
    timeZone:
      input.timeZone ??
      input.homes.find((home) => home.timeZone)?.timeZone ??
      null,
    gridConnections,
  };
}

export function findGridConnection(
  property: EnergyProperty,
  connectionIdOrHomeId: string,
): GridConnection | null {
  return (
    property.gridConnections.find(
      (connection) =>
        connection.id === connectionIdOrHomeId ||
        connection.providerHomeId === connectionIdOrHomeId,
    ) ?? null
  );
}
