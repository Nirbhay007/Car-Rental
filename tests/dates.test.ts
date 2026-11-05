import { describe, expect, it } from "vitest";
import {
  getTimeZoneOffsetMinutes,
  wallTimeToUtc,
} from "@/lib/geo/time";
import { calculateRentalDays } from "@/lib/search/pricing";

describe("rental day billing", () => {
  const from = new Date("2026-11-10T10:00:00Z");

  it("counts a 24-hour rental as one day", () => {
    const to = new Date(from.getTime() + 24 * 60 * 60 * 1000);
    expect(calculateRentalDays(from, to)).toBe(1);
  });

  it("applies the 29-minute grace period", () => {
    expect(
      calculateRentalDays(from, new Date(from.getTime() + (24 * 60 + 29) * 60_000))
    ).toBe(1);
    expect(
      calculateRentalDays(from, new Date(from.getTime() + (24 * 60 + 30) * 60_000))
    ).toBe(2);
  });

  it("bills a minimum of one day", () => {
    expect(
      calculateRentalDays(from, new Date(from.getTime() + 60 * 60_000))
    ).toBe(1);
  });

  it("bills 48 hours as two days", () => {
    expect(
      calculateRentalDays(from, new Date(from.getTime() + 48 * 60 * 60_000))
    ).toBe(2);
  });

  it("returns zero for an invalid range", () => {
    expect(calculateRentalDays(from, from)).toBe(0);
  });
});

describe("wall time to UTC", () => {
  it("converts a Berlin winter wall time", () => {
    const instant = wallTimeToUtc("2026-01-15T10:00", "Europe/Berlin");
    expect(instant.toISOString()).toBe("2026-01-15T09:00:00.000Z");
  });

  it("converts a Berlin summer wall time", () => {
    const instant = wallTimeToUtc("2026-07-15T10:00", "Europe/Berlin");
    expect(instant.toISOString()).toBe("2026-07-15T08:00:00.000Z");
  });

  it("converts a New York wall time", () => {
    const instant = wallTimeToUtc("2026-01-15T10:00", "America/New_York");
    expect(instant.toISOString()).toBe("2026-01-15T15:00:00.000Z");
  });

  it("reports the correct offset around a DST transition", () => {
    const winter = new Date("2026-01-15T12:00:00Z");
    const summer = new Date("2026-07-15T12:00:00Z");
    expect(getTimeZoneOffsetMinutes(winter, "Europe/Berlin")).toBe(60);
    expect(getTimeZoneOffsetMinutes(summer, "Europe/Berlin")).toBe(120);
  });
});
