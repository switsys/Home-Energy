import { describe, expect, it } from "vitest";
import { selectPriceCurveSlots } from "../app/price-curve-period";

describe("price curve period selection", () => {
  const today = [
    { startsAt: "2026-10-20T23:45:00+02:00", value: 1 },
  ];
  const tomorrow = [
    { startsAt: "2026-10-21T00:00:00+02:00", value: 2 },
    { startsAt: "2026-10-21T00:15:00+02:00", value: 3 },
  ];

  it("selects the requested day without merging grid tariff scopes", () => {
    expect(selectPriceCurveSlots(today, tomorrow, "today")).toEqual(today);
    expect(selectPriceCurveSlots(today, tomorrow, "tomorrow")).toEqual(tomorrow);
    expect(selectPriceCurveSlots(today, tomorrow, "2days")).toEqual([
      ...today,
      ...tomorrow,
    ]);
  });

  it("handles a missing next-day schedule", () => {
    expect(selectPriceCurveSlots(today, [], "tomorrow")).toEqual([]);
    expect(selectPriceCurveSlots(today, [], "2days")).toEqual(today);
  });

  it("removes overlapping timestamps and sorts absolute time across DST", () => {
    const first = { startsAt: "2026-10-25T02:30:00+02:00", value: 1 };
    const second = { startsAt: "2026-10-25T02:15:00+01:00", value: 2 };
    const repeated = { ...second, value: 999 };
    expect(selectPriceCurveSlots([second, first], [repeated], "2days")).toEqual([
      first,
      second,
    ]);
  });
});
