import { describe, expect, it } from "vitest";
import { faluElnat2026, resolveGridTariff } from "../src/index.js";

describe("Falu Elnät 2026 tariff", () => {
  it("uses the winter weekday effect tariff from 07:00 to 19:00", () => {
    const quote = faluElnat2026.quote(
      new Date("2026-11-03T10:00:00+01:00"),
    );

    expect(quote).toMatchObject({
      transferPerKwh: 0.1125,
      loadPeriod: "high",
      season: "winter",
      demandRatePerKwMonth: 75,
      peakWindowMinutes: 60,
      peakAveragingCount: 3,
    });
  });

  it("uses zero effect tariff at night, weekends, red days and excluded eves", () => {
    expect(
      faluElnat2026.quote(new Date("2026-11-03T20:00:00+01:00"))
        .demandRatePerKwMonth,
    ).toBe(0);

    expect(
      faluElnat2026.quote(new Date("2026-11-07T12:00:00+01:00")).loadPeriod,
    ).toBe("low");

    expect(
      faluElnat2026.quote(new Date("2026-12-25T12:00:00+01:00")).loadPeriod,
    ).toBe("low");

    expect(
      faluElnat2026.quote(new Date("2026-12-24T12:00:00+01:00")).loadPeriod,
    ).toBe("low");

    expect(
      faluElnat2026.quote(new Date("2026-12-31T12:00:00+01:00")).loadPeriod,
    ).toBe("low");
  });

  it("uses no effect tariff from April through October", () => {
    const quote = faluElnat2026.quote(
      new Date("2026-10-08T12:00:00+02:00"),
    );

    expect(quote).toMatchObject({
      transferPerKwh: 0.1125,
      loadPeriod: "low",
      season: "summer",
      demandRatePerKwMonth: 0,
    });
  });

  it("resolves configured aliases and rejects unknown tariffs", () => {
    expect(resolveGridTariff("falu-elnat-2026")?.id).toBe("falu-elnat-2026");
    expect(resolveGridTariff("falu-elnat")?.id).toBe("falu-elnat-2026");
    expect(resolveGridTariff("falu-energi-vatten")?.id).toBe("falu-elnat-2026");
    expect(resolveGridTariff("")).toBeNull();
    expect(() => resolveGridTariff("unknown")).toThrow(/Unknown grid tariff/);
  });
});
