import { describe, expect, it } from "vitest";
import { BREAKFAST_CATEGORY_SLUGS, isBreakfastServed, lockedCategorySlugs, restaurantHour } from "./serving-window";

// Istanbul is UTC+3 all year, so 07:00Z is 10:00 local.
const at = (utc: string) => new Date(utc);

describe("breakfast serving window (Europe/Istanbul)", () => {
  it("reads the hour in restaurant time, not UTC", () => {
    expect(restaurantHour(at("2026-06-01T07:00:00Z"))).toBe(10);
    expect(restaurantHour(at("2026-12-01T07:00:00Z"))).toBe(10);
  });

  it("serves from 10:00 up to but not including 16:00", () => {
    expect(isBreakfastServed(at("2026-06-01T06:59:00Z"))).toBe(false); // 09:59
    expect(isBreakfastServed(at("2026-06-01T07:00:00Z"))).toBe(true); // 10:00
    expect(isBreakfastServed(at("2026-06-01T12:59:00Z"))).toBe(true); // 15:59
    expect(isBreakfastServed(at("2026-06-01T13:00:00Z"))).toBe(false); // 16:00
  });

  it("locks nothing during service and the breakfast categories outside it", () => {
    expect(lockedCategorySlugs(at("2026-06-01T09:00:00Z"))).toEqual([]);
    expect(lockedCategorySlugs(at("2026-06-01T20:00:00Z"))).toEqual([...BREAKFAST_CATEGORY_SLUGS]);
  });
});
