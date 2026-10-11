import { describe, expect, it } from "vitest";
import { dashboardPeriodUrl, selectedConsumptionDays } from "../app/dashboard-period";

describe("homestead consumption period navigation", () => {
  it("allows exactly the 7- or 30-day period", () => {
    expect(selectedConsumptionDays(undefined)).toBe(7);
    expect(selectedConsumptionDays("7")).toBe(7);
    expect(selectedConsumptionDays("30")).toBe(30);
    expect(selectedConsumptionDays("31")).toBe(7);
    expect(selectedConsumptionDays("-1")).toBe(7);
    expect(selectedConsumptionDays(["30", "7"])).toBe(30);
  });

  it("preserves load planning and meter selection when changing periods", () => {
    const url = new URL(
      dashboardPeriodUrl({
        days: 30,
        minutes: 90,
        powerKw: 2.5,
        homeId: "home/2&3",
      }),
      "https://example.test",
    );
    expect(url.pathname).toBe("/");
    expect(Object.fromEntries(url.searchParams)).toEqual({
      days: "30",
      minutes: "90",
      powerKw: "2.5",
      homeId: "home/2&3",
    });
  });

  it("keeps the shared view free of a fabricated meter selector when none exists", () => {
    expect(
      new URL(
        dashboardPeriodUrl({
          days: 7,
          minutes: 120,
          powerKw: 1.5,
          homeId: null,
        }),
        "https://example.test",
      ).searchParams.has("homeId"),
    ).toBe(false);
  });
});
