import type { DateRange } from "@/lib/analytics/sales";
import { datesInRange } from "@/lib/analytics/range";

/**
 * How much data a claim about this period is allowed to rest on.
 *
 * Every other module here computes what the numbers SAY. This one computes what
 * they can support — the sample behind each shape of claim — because that is the
 * part an owner cannot audit and the part that destroys trust when it's thin. A
 * dashboard that reports "Wednesdays run 5.3×" from a 16-day range is reporting a
 * fact about two Wednesdays; the owner who acts on it once and loses money stops
 * believing the rest of the page too.
 *
 * The same object is used three ways, so the number shown to the owner and the
 * number enforced against the model can never drift apart:
 *  - handed to the LLM as `dataBasis`, with hard rules attached (insights.ts);
 *  - enforced in code after the model answers (`dropLowConfidenceClaims`);
 *  - printed on the AI card as the period's data basis, so a reader can see the
 *    sample without asking for it.
 *
 * Deliberately free of `server-only` and of any query: it's pure arithmetic over
 * figures the callers already have, so the client component can render from the
 * exact same shape the server reasoned with.
 */

/** JS weekday index (0 = Sunday) for a yyyy-mm-dd, anchored at UTC noon (DST-safe). */
function weekdayOf(dateISO: string): number {
  return new Date(`${dateISO}T12:00:00Z`).getUTCDay();
}

/** Turkish weekday names by JS index — the labels findings actually use. */
export const TR_WEEKDAYS = ["Pazar", "Pazartesi", "Salı", "Çarşamba", "Perşembe", "Cuma", "Cumartesi"];

/** Monday-first display order; nobody reads a week starting on Sunday here. */
const DISPLAY_ORDER = [1, 2, 3, 4, 5, 6, 0];

export type DataBasis = {
  /** Days in the picked range. */
  rangeDays: number;
  /** Days that actually have a POS entry — the real denominator. */
  salesDays: number;
  /** Occurrences of each weekday among the days WITH sales data, Monday first. */
  weekdayCounts: { day: string; days: number }[];
  sessions: number;
  /** Days of engagement data (the tracking floor can make this < rangeDays). */
  engagementDays: number;
  /** Distinct items with at least one real sale. */
  itemsWithSales: number;
};

/**
 * A weekday claim needs this many occurrences of that weekday. Four is the point
 * where "Wednesdays are different" stops being two coin flips; it also keeps a
 * 30-day range (4–5 of each weekday) usable, which a stricter bar would not.
 */
export const MIN_WEEKDAY_DAYS = 4;

/** Under this many recorded sales days, there is no trend to describe. */
export const MIN_TREND_DAYS = 7;

/** Below this, the period is too thin to lead with confident findings at all. */
export const THIN_PERIOD_DAYS = 10;

export function buildDataBasis(input: {
  range: DateRange;
  /** Dates (yyyy-mm-dd) that have a POS entry. Duplicates are fine. */
  salesDates: string[];
  sessions: number;
  engagementDays: number;
  itemsWithSales: number;
}): DataBasis {
  const unique = [...new Set(input.salesDates)];
  const counts = new Array(7).fill(0);
  for (const d of unique) counts[weekdayOf(d)]++;

  return {
    rangeDays: datesInRange(input.range).length,
    salesDays: unique.length,
    weekdayCounts: DISPLAY_ORDER.map((i) => ({ day: TR_WEEKDAYS[i], days: counts[i] })),
    sessions: input.sessions,
    engagementDays: input.engagementDays,
    itemsWithSales: input.itemsWithSales,
  };
}

/** True while the period is too thin for its findings to be read as settled. */
export function isThinPeriod(basis: DataBasis): boolean {
  return basis.salesDays < THIN_PERIOD_DAYS;
}

/**
 * One-line summary of the sample, for the AI card's footer: "16/30 gün satış
 * verisi · 412 oturum · 38 ürün". Printed rather than hidden behind a tooltip —
 * the whole point is that the reader sees the basis at the same time as the claim.
 */
export function describeBasis(basis: DataBasis): string {
  const parts = [`${basis.salesDays}/${basis.rangeDays} gün satış verisi`];
  if (basis.sessions > 0) parts.push(`${basis.sessions.toLocaleString("tr-TR")} oturum`);
  if (basis.itemsWithSales > 0) parts.push(`${basis.itemsWithSales} ürün`);
  return parts.join(" · ");
}

/** The weekdays too rare in this period to support a claim — named, not just counted. */
export function thinWeekdays(basis: DataBasis): string[] {
  return basis.weekdayCounts.filter((w) => w.days < MIN_WEEKDAY_DAYS).map((w) => w.day);
}
