import { describe, expect, it } from "vitest";
import {
  buildEnergyProperty,
  findGridConnection,
  type EnergyHome,
} from "../src/index.js";

const homes: readonly EnergyHome[] = [
  {
    id: "meter-a",
    name: "Li-Erikes Gård",
    timeZone: "Europe/Stockholm",
    gridCompany: "Falu Elnät AB",
    gridAreaCode: "FLN",
    priceAreaCode: "SE3",
  },
  {
    id: "meter-b",
    name: "Hus2/3",
    timeZone: "Europe/Stockholm",
    gridCompany: "Falu Elnät AB",
    gridAreaCode: "FLN",
    priceAreaCode: "SE3",
  },
];

describe("buildEnergyProperty", () => {
  it("groups multiple provider homes into one property while keeping billing scopes separate", () => {
    const property = buildEnergyProperty({
      id: "li-erikes",
      name: "Li-Erikes Gård",
      providerId: "tibber",
      homes,
      gridTariffId: "falu-elnat-2026",
    });

    expect(property).toMatchObject({
      id: "li-erikes",
      name: "Li-Erikes Gård",
      timeZone: "Europe/Stockholm",
    });
    expect(property.gridConnections).toHaveLength(2);
    expect(property.gridConnections[0]).toMatchObject({
      id: "tibber:meter-a",
      providerHomeId: "meter-a",
      billingScopeId: "tibber:meter-a",
      gridTariffId: "falu-elnat-2026",
    });
    expect(property.gridConnections[1]).toMatchObject({
      id: "tibber:meter-b",
      providerHomeId: "meter-b",
      billingScopeId: "tibber:meter-b",
    });
    expect(property.gridConnections[0]?.billingScopeId).not.toBe(
      property.gridConnections[1]?.billingScopeId,
    );
  });

  it("finds a connection by Home-Energy id or provider home id", () => {
    const property = buildEnergyProperty({
      id: "li-erikes",
      name: "Li-Erikes Gård",
      providerId: "tibber",
      homes,
    });

    expect(findGridConnection(property, "tibber:meter-b")?.providerHomeId).toBe(
      "meter-b",
    );
    expect(findGridConnection(property, "meter-a")?.id).toBe("tibber:meter-a");
  });
});
