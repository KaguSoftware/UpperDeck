/**
 * Breakfast is a kitchen-hours product: the line switches over at 16:00 and the
 * plates only come back at 10:00 the next morning. Outside those hours the items
 * are shown sold out — exactly as if staff had flagged them by hand — so diners
 * can still read the menu, they just can't order from it.
 *
 * Cheaper than a waiter walking back to the table to say no.
 *
 * Slugs, not IDs, so the list survives a reseed. `breakfast` is the only one the
 * live menu still uses; `breakfast-extra` is kept because the seed migration
 * creates it, so a database built from migrations alone locks correctly too.
 *
 * The live `extra` category is deliberately absent: it mixes breakfast add-ons
 * (Füme Et, Fried Egg) with burger ones (Burger Patty, Crispy Chicken), so
 * locking it would take the burger extras down after 16:00 as well. Splitting
 * those into their own category is the fix — then add its slug here.
 */

export const BREAKFAST_CATEGORY_SLUGS = ["breakfast", "breakfast-extra"] as const;

/** Served from 10:00 up to (not including) 16:00 — restaurant local time. */
export const BREAKFAST_START_HOUR = 10;
export const BREAKFAST_END_HOUR = 16;

/** The kitchen's clock, not the diner's — a tourist's phone may be on any zone. */
const RESTAURANT_TIME_ZONE = "Europe/Istanbul";

const hourFormat = new Intl.DateTimeFormat("en-GB", {
  timeZone: RESTAURANT_TIME_ZONE,
  hour: "2-digit",
  hourCycle: "h23",
});

export function restaurantHour(now: Date = new Date()): number {
  return parseInt(hourFormat.format(now), 10);
}

export function isBreakfastServed(now: Date = new Date()): boolean {
  const hour = restaurantHour(now);
  return hour >= BREAKFAST_START_HOUR && hour < BREAKFAST_END_HOUR;
}

/**
 * Category slugs the diner may browse but not order from right now. Empty during
 * breakfast service — callers treat the empty array as "nothing is locked".
 */
export function lockedCategorySlugs(now: Date = new Date()): string[] {
  return isBreakfastServed(now) ? [] : [...BREAKFAST_CATEGORY_SLUGS];
}
