import { describe, expect, it } from "vitest";
import { addGridTransferToPrices } from "../app/price-components";

const price = { startsAt: "2026-10-19T14:00:00+02:00", total: 1.6, currency: "SEK", level: "NORMAL" };
const quote = { startsAt: "2026-10-19T12:00:00Z", currency: "SEK", transferPerKwh: 0.1125 };

describe("Tibber price comparison", () => {
  it("adds only the modeled variable transfer fee and preserves source prices", () => {
    const output = addGridTransferToPrices([price], [quote]);
    expect(output?.[0]).toEqual({ ...price, total: 1.7125 });
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
    expect(addGridTransferToPrices([first, second], [secondQuote, firstQuote])?.map((p) => p.total))
      .toEqual([1.7, 1.8]);
  });
});
