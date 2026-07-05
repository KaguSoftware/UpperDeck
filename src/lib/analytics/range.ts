import type { DateRange } from "@/lib/analytics/sales";

export type RangePreset = "today" | "7d" | "30d" | "90d" | "custom";

// Restaurant-local timezone — "today" and preset windows follow the real
// business day, matching how the PostHog queries bucket events (see posthog.ts).
const TZ = "Europe/Istanbul";

// en-CA formats as yyyy-mm-dd, so this yields the current local calendar date.
const localTodayISO = new Intl.DateTimeFormat("en-CA", { timeZone: TZ });

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

  const today = localTodayISO.format(new Date());
  const days = preset === "today" ? 0 : preset === "7d" ? 6 : preset === "90d" ? 89 : 29;

  return { preset, range: { from: isoDaysAgo(today, days), to: today } };
}
