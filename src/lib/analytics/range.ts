import { businessDayStart } from "@/lib/analytics/business-day";
import type { DateRange } from "@/lib/analytics/sales";

export type RangePreset = "today" | "7d" | "30d" | "90d" | "custom";

// Restaurant-local timezone — "today" and preset windows follow the real
// business day, matching how the PostHog queries bucket events (see posthog.ts).
const TZ = "Europe/Istanbul";

// en-CA formats as yyyy-mm-dd, so this yields the current local calendar date.
const localTodayISO = new Intl.DateTimeFormat("en-CA", { timeZone: TZ });

/**
 * The CURRENT business day, honoring the configured start hour: at 01:30 with a
 * 06:00 boundary the restaurant is still working last night's shift, so "Bugün"
 * has to mean the previous calendar date — otherwise the preset shows an empty
 * page while service is still running. Identical to the calendar date at the
 * default start hour of 0.
 */
function businessTodayISO(now = new Date()): string {
  const shifted = new Date(now.getTime() - businessDayStart() * 3_600_000);
  return localTodayISO.format(shifted);
}

/**
 * True while the range still reaches the current business day — i.e. its numbers
 * can still change. A finished window never can, which is what makes polling it
 * on a timer pointless (and disruptive to read over).
 */
export function isLiveRange(range: DateRange): boolean {
  return range.to >= businessTodayISO();
}

/** Every yyyy-mm-dd in an inclusive range, oldest first. */
export function datesInRange(range: DateRange): string[] {
  const out: string[] = [];
  const end = Date.parse(`${range.to}T12:00:00Z`);
  for (let t = Date.parse(`${range.from}T12:00:00Z`); t <= end; t += 86_400_000) {
    out.push(new Date(t).toISOString().slice(0, 10));
  }
  return out;
}

/**
 * How much of the picked range the POS log actually covers.
 *
 * The sales log has gaps — a month whose import was never run reads as zeros, so
 * a range total silently under-reports and a period-over-period percentage is
 * arithmetic over two different numbers of days. Every consumer of a range total
 * needs to be able to say so out loud instead of presenting the gap as a decline.
 */
export type SalesCoverage = {
  /** Days in the picked range. */
  days: number;
  /** Days with a POS entry. */
  daysWithData: number;
  /** Dates with no entry at all, oldest first. */
  missing: string[];
  /** 0–1. */
  ratio: number;
};

/** Coverage of `range` given the dates that DO have a sales entry. */
export function salesCoverage(range: DateRange, datesWithData: Iterable<string>): SalesCoverage {
  const have = new Set(datesWithData);
  const all = datesInRange(range);
  const missing = all.filter((d) => !have.has(d));
  const daysWithData = all.length - missing.length;
  return {
    days: all.length,
    daysWithData,
    missing,
    ratio: all.length > 0 ? daysWithData / all.length : 0,
  };
}

/**
 * Below this share of covered days, a range total is missing enough of the period
 * that comparing it to another one is fiction — the deltas get muted rather than
 * presented as a real movement.
 */
export const RELIABLE_COVERAGE = 0.9;

function iso(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** yyyy-mm-dd shifted back `days` days, anchored at UTC noon to dodge DST slips. */
function isoDaysAgo(todayISO: string, days: number): string {
  const anchor = new Date(`${todayISO}T12:00:00Z`);
  anchor.setUTCDate(anchor.getUTCDate() - days);
  return iso(anchor);
}

/**
 * The window of equal length immediately before `range` (for period-over-period
 * deltas): last 7 days → the 7 days before those, today → yesterday.
 */
export function previousRange(range: DateRange): DateRange {
  const lengthDays = rangeLength(range);
  return {
    from: isoDaysAgo(range.from, lengthDays),
    to: isoDaysAgo(range.from, 1),
  };
}

/** Inclusive day count of a range. */
export function rangeLength(range: DateRange): number {
  return (
    Math.round((Date.parse(`${range.to}T12:00:00Z`) - Date.parse(`${range.from}T12:00:00Z`)) / 86_400_000) + 1
  );
}

/** The same span shifted back a whole number of days, length preserved. */
function shiftRange(range: DateRange, days: number): DateRange {
  return { from: isoDaysAgo(range.from, days), to: isoDaysAgo(range.to, days) };
}

/**
 * What "compared to" means.
 *
 * "The period before this one" is the wrong baseline for most restaurant
 * questions and quietly produces fake movement: the 30 days before a 30-day
 * window are a different part of the season, and for short windows they aren't
 * even the same days of the week — comparing Sat+Sun against Tue+Wed reads as a
 * collapse that never happened.
 *
 * The two alternatives are both WEEKDAY-ALIGNED multiples of 7 for exactly that
 * reason: 28 days back is the same weekdays a month earlier, 364 days back (52
 * weeks, not a calendar year) is the same weekdays last year. In a seasonal
 * business those are the comparisons that carry meaning.
 */
export type CompareBasis = "prev" | "4w" | "52w";

export const COMPARE_BASES: { key: CompareBasis; label: string; short: string; hint: string }[] = [
  {
    key: "prev",
    label: "Önceki dönem",
    short: "Önceki",
    hint: "Bu dönemden hemen önceki eşit uzunlukta dönem",
  },
  {
    key: "4w",
    label: "4 hafta önce",
    short: "4 Hf",
    hint: "Tam 28 gün önce — aynı hafta günleri, bir ay öncesi",
  },
  {
    key: "52w",
    label: "Geçen yıl",
    short: "Geçen Yıl",
    hint: "52 hafta (364 gün) önce — aynı hafta günleri, geçen yılın aynı dönemi",
  },
];

const BASIS_SHIFT: Record<Exclude<CompareBasis, "prev">, number> = { "4w": 28, "52w": 364 };

/**
 * Resolve the comparison window for `range` from the `cmp` search param.
 * Defaults to the immediately-preceding period, so nothing changes for a URL
 * that predates the picker.
 */
export function resolveCompare(
  params: { cmp?: string },
  range: DateRange
): { basis: CompareBasis; label: string; range: DateRange } {
  const basis: CompareBasis = params.cmp === "4w" || params.cmp === "52w" ? params.cmp : "prev";
  const meta = COMPARE_BASES.find((b) => b.key === basis)!;
  return {
    basis,
    label: meta.label,
    range: basis === "prev" ? previousRange(range) : shiftRange(range, BASIS_SHIFT[basis]),
  };
}

/**
 * Resolve a date range from URL search params. Supports presets and an explicit
 * `from`/`to` custom range (used to match an uploaded sheet's period).
 * Defaults to the last 30 days. All dates are in the restaurant's local timezone.
 */
export function resolveRange(params: { range?: string; from?: string; to?: string }): {
  preset: RangePreset;
  range: DateRange;
} {
  const re = /^\d{4}-\d{2}-\d{2}$/;

  if (params.range === "custom" && params.from && params.to && re.test(params.from) && re.test(params.to)) {
    return { preset: "custom", range: { from: params.from, to: params.to } };
  }

  const preset = (["today", "7d", "30d", "90d"].includes(params.range ?? "")
    ? params.range
    : "30d") as RangePreset;

  const today = businessTodayISO();
  const days = preset === "today" ? 0 : preset === "7d" ? 6 : preset === "90d" ? 89 : 29;

  return { preset, range: { from: isoDaysAgo(today, days), to: today } };
}
