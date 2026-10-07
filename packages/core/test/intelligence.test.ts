import { describe, expect, it } from "vitest";
import { buildEnergyAdvice, type PriceSchedule, type PriceSlot } from "../src/index.js";

function price(startsAt: string, total: number, level: PriceSlot["level"] = null): PriceSlot {
  return {
    total,
    energy: total,
    tax: 0,
    startsAt,
    currency: "SEK",
    level,
  };
}

function schedule(current: PriceSlot, today: readonly PriceSlot[]): PriceSchedule {
  return {
    provider: "test",
    homeId: "home-1",
    current,
    today,
    tomorrow: [],
  };
}

describe("buildEnergyAdvice", () => {
  it("recommends running now for very cheap power", () => {
    const current = price("2026-10-05T22:15:00+02:00", 0.0543, "VERY_CHEAP");
    const advice = buildEnergyAdvice(
      schedule(current, [
        current,
        price("2026-10-05T22:30:00+02:00", 0.4),
        price("2026-10-05T22:45:00+02:00", 0.5),
        price("2026-10-05T23:00:00+02:00", 0.6),
      ]),
      new Date("2026-10-05T22:20:00+02:00"),
    );

    expect(advice.recommendation.action).toBe("run_now");
    expect(advice.current).toMatchObject({
      startsAt: "2026-10-05T20:15:00.000Z",
      total: 0.0543,
    });
  });

  it("does not recommend run_now for a very expensive current price", () => {
    const current = price(
      "2026-10-07T12:00:00+02:00",
      1.21,
      "VERY_EXPENSIVE",
    );
    const slots = [
      current,
      price("2026-10-07T12:15:00+02:00", 1.17),
      price("2026-10-07T12:30:00+02:00", 1.50),
      price("2026-10-07T12:45:00+02:00", 1.60),
      price("2026-10-07T13:00:00+02:00", 1.70),
      price("2026-10-07T13:15:00+02:00", 1.80),
      price("2026-10-07T13:30:00+02:00", 1.90),
      price("2026-10-07T13:45:00+02:00", 2.00),
    ];

    const advice = buildEnergyAdvice(
      schedule(current, slots),
      new Date("2026-10-07T12:05:00+02:00"),
    );

    expect(advice.recommendation.action).not.toBe("run_now");
  });

  it("finds a cheaper contiguous hour and recommends waiting", () => {
    const slots = [
      price("2026-10-05T19:45:00+02:00", 1.0),
      price("2026-10-05T20:00:00+02:00", 0.9),
      price("2026-10-05T20:15:00+02:00", 0.2),
      price("2026-10-05T20:30:00+02:00", 0.2),
      price("2026-10-05T20:45:00+02:00", 0.2),
      price("2026-10-05T21:00:00+02:00", 0.2),
    ];

    const advice = buildEnergyAdvice(
      schedule(slots[0], slots),
      new Date("2026-10-05T19:50:00+02:00"),
    );

    expect(advice.cheapestWindows.minutes60).toMatchObject({
      startsAt: "2026-10-05T18:15:00.000Z",
      endsAt: "2026-10-05T19:15:00.000Z",
      average: 0.2,
    });
    expect(advice.recommendation.action).toBe("wait");
    expect(advice.recommendation.nextCheaperAt).toBe("2026-10-05T18:15:00.000Z");
  });

  it("rounds window averages instead of exposing floating-point noise", () => {
    const slots = [
      price("2026-10-07T12:15:00+02:00", 1.1736),
      price("2026-10-07T12:30:00+02:00", 1.2233),
      price("2026-10-07T12:45:00+02:00", 1.2107),
      price("2026-10-07T13:00:00+02:00", 1.2234),
      price("2026-10-07T13:15:00+02:00", 1.1736),
      price("2026-10-07T13:30:00+02:00", 1.2233),
      price("2026-10-07T13:45:00+02:00", 1.2045),
      price("2026-10-07T14:00:00+02:00", 1.2217),
    ];

    const advice = buildEnergyAdvice(
      schedule(slots[0], slots),
      new Date("2026-10-07T12:16:00+02:00"),
    );

    expect(advice.cheapestWindows.minutes120?.average).toBe(1.20676);
  });
});
