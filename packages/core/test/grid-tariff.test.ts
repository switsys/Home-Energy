import { describe, expect, it } from "vitest";
import { dalaEnergi2026, resolveGridTariff } from "../src/index.js";

describe("Dala Energi 2026 tariff", () => {
  it("uses winter weekday high-load pricing from 07:00 to 19:00", () => {
    const quote = dalaEnergi2026.quote(
      new Date("2026-11-03T10:00:00+01:00"),
    );

    expect(quote).toMatchObject({
      transferPerKwh: 0.09,
      loadPeriod: "high",
      season: "winter",
      demandRatePerKwMonth: 105,
      peakWindowMinutes: 60,
      peakAveragingCount: 3,
    });
  });

  it("uses low-load pricing at night, weekends and red days", () => {
    expect(
      dalaEnergi2026.quote(new Date("2026-11-03T20:00:00+01:00"))
        .demandRatePerKwMonth,
    ).toBe(35);

    expect(
      dalaEnergi2026.quote(new Date("2026-11-07T12:00:00+01:00")).loadPeriod,
    ).toBe("low");

    expect(
      dalaEnergi2026.quote(new Date("2026-12-25T12:00:00+01:00")).loadPeriod,
    ).toBe("low");

    expect(
      dalaEnergi2026.quote(new Date("2026-10-31T12:00:00+01:00")).loadPeriod,
    ).toBe("low");
  });

  it("uses the summer rate during April through October", () => {
    const quote = dalaEnergi2026.quote(
      new Date("2026-10-08T12:00:00+02:00"),
    );

    expect(quote).toMatchObject({
      loadPeriod: "high",
      season: "summer",
      demandRatePerKwMonth: 35,
    });
  });

  it("resolves configured aliases and rejects unknown tariffs", () => {
    expect(resolveGridTariff("dala-energi-2026")?.id).toBe("dala-energi-2026");
    expect(resolveGridTariff("dala-energi")?.id).toBe("dala-energi-2026");
    expect(resolveGridTariff("")).toBeNull();
    expect(() => resolveGridTariff("unknown")).toThrow(/Unknown grid tariff/);
  });
});
