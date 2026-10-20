export type GridTransferSlot = Readonly<{
  startsAt: string;
  currency: string;
  transferPerKwh: number;
}>;

/** Keep Tibber's total untouched; add only the modeled variable network fee for display. */
export function addGridTransferToPrices<T extends Readonly<{
  startsAt: string;
  total: number;
  currency: string;
}>>(
  prices: readonly T[],
  quotes: readonly GridTransferSlot[],
): readonly T[] | null {
  const byInstant = new Map(
    quotes
      .filter((quote) => Number.isFinite(Date.parse(quote.startsAt)))
      .map((quote) => [Date.parse(quote.startsAt), quote] as const),
  );
  const result: T[] = [];
  for (const price of prices) {
    const at = Date.parse(price.startsAt);
    const quote = byInstant.get(at);
    if (!Number.isFinite(at) || !Number.isFinite(price.total) ||
        !quote || quote.currency !== price.currency ||
        !Number.isFinite(quote.transferPerKwh) || quote.transferPerKwh < 0) {
      return null;
    }
    result.push({ ...price, total: price.total + quote.transferPerKwh });
  }
  return result;
}
