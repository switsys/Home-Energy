import { describe, expect, it } from "vitest";
import { addGridTransferToPrices, addDeliveredVariablePrices } from "../app/price-components";

const price = { startsAt: "2026-10-19T14:00:00+02:00", total: 1.6, currency: "SEK", level: "NORMAL" };
const quote = { startsAt: "2026-10-19T12:00:00Z", currency: "SEK", transferPerKwh: 0.1125 };

describe("Tibber price comparison", () => {
  it("adds only the modeled variable transfer fee and preserves source prices", () => {
    const output = addGridTransferToPrices([price], [quote]);
    expect(output?.[0]).toMatchObject({ startsAt: price.startsAt, currency: price.currency, level: price.level });
    expect(output?.[0]?.total).toBeCloseTo(1.7125, 6);
    expect(price.total).toBe(1.6);
  });

  it("does not invent data when a slot or currency does not match", () => {
    expect(addGridTransferToPrices([price], [])).toBeNull();
    expect(addGridTransferToPrices([price], [{ ...quote, currency: "EUR" }])).toBeNull();
    expect(addGridTransferToPrices([price], [{ ...quote, transferPerKwh: Number.NaN }])).toBeNull();
  });

  it("matches DST repeated-hour slots by absolute instant, not wall clock", () => {
    const first = { ...price, startsAt: "2026-10-25T02:15:00+02:00" };
    const second = { ...price, startsAt: "2026-10-25T02:15:00+01:00" };
    const firstQuote = { ...quote, startsAt: first.startsAt, transferPerKwh: 0.1 };
    const secondQuote = { ...quote, startsAt: second.startsAt, transferPerKwh: 0.2 };
    const totals = addGridTransferToPrices([first, second], [secondQuote, firstQuote])?.map((p) => p.total);
    expect(totals?.[0]).toBeCloseTo(1.7, 6);
    expect(totals?.[1]).toBeCloseTo(1.8, 6);
  });
});

describe("Tibber app-comparable variable pricing", () => {
  it("matches 224 öre for the 18:30 comparison while preserving the raw Tibber value", () => {
    const raw = { ...price, total: 1.681, startsAt: "2026-10-23T18:30:00+02:00" };
    const grid = { ...quote, startsAt: "2026-10-23T16:30:00Z", energyTaxPerKwh: 0.45 };
    const delivered = addDeliveredVariablePrices([raw], [grid]);
    expect(delivered?.[0]?.total).toBeCloseTo(2.2435, 6);
    expect(raw.total).toBe(1.681);
  });

  it("does not fabricate missing, mismatched or nonfinite data", () => {
    const original = { ...price, total: Number.NaN };
    expect(addDeliveredVariablePrices([original], [quote])).toBeNull();
    expect(addDeliveredVariablePrices([price], [])).toBeNull();
    expect(addDeliveredVariablePrices([price], [{ ...quote, currency: "EUR" }])).toBeNull();
    expect(addDeliveredVariablePrices([price], [{ ...quote, energyTaxPerKwh: Number.NaN }])).toBeNull();
  });

  it("uses distinct instants across the Stockholm DST repeated hour", () => {
    const first = { ...price, startsAt: "2026-10-25T02:15:00+02:00" };
    const second = { ...price, startsAt: "2026-10-25T02:15:00+01:00" };
    const p = addDeliveredVariablePrices([first, second], [
      { ...quote, startsAt: second.startsAt, energyTaxPerKwh: 0.45 },
      { ...quote, startsAt: first.startsAt, energyTaxPerKwh: 0.3 },
    ]);
    expect(p?.[0].total).toBeCloseTo(2.0125, 6);
    expect(p?.[1].total).toBeCloseTo(2.1625, 6);
  });
});
