/**
 * "When does a business day start?" — the setting that silently re-slices every
 * daily and day-of-week figure on the analytics tab.
 *
 * A restaurant serving past midnight books a 01:30 order on the calendar day it
 * happened (Saturday) while the kitchen, the shift and the POS cash-up all call
 * it Friday night. Every weekday pattern, daily revenue bucket and heatmap cell
 * changes depending on which convention is used, so it has to be stated and
 * configurable rather than left implicit at midnight.
 *
 * The value is a single restaurant-wide setting, so it lives in module state:
 * `loadBusinessDayStart()` reads it once per request into the process, and the
 * PostHog query builder (`posthog.ts`) and `resolveRange()` both read it back
 * synchronously. Callers MUST load it before running any query — page.tsx and
 * the analytics server actions do so immediately after `requireRole`.
 *
 * 0 (the default) means plain calendar days: the shifted expression collapses to
 * the previous one exactly, so nothing changes until an owner opts in.
 */

export const BUSINESS_DAY_START_KEY = "analytics_business_day_start";

/** Offered in the UI. 0 = calendar day (midnight). */
export const BUSINESS_DAY_START_OPTIONS = [0, 4, 5, 6, 7, 8] as const;

export const BUSINESS_DAY_START_DEFAULT = 0;

/** Past this the "day" would swallow the next lunch service — reject as garbage. */
const MAX_START_HOUR = 12;

let startHour: number = BUSINESS_DAY_START_DEFAULT;

/** Clamp any stored/submitted value to a usable hour; anything odd → default. */
export function normalizeBusinessDayStart(value: unknown): number {
  const n = Math.trunc(Number(value));
  return Number.isFinite(n) && n >= 0 && n <= MAX_START_HOUR ? n : BUSINESS_DAY_START_DEFAULT;
}

/** Set the process-wide value. Returns the normalized hour actually applied. */
export function setBusinessDayStart(value: unknown): number {
  startHour = normalizeBusinessDayStart(value);
  return startHour;
}

/** The hour a business day starts (0–12). Read by posthog.ts and range.ts. */
export function businessDayStart(): number {
  return startHour;
}

/** Human label for the UI / on-page note. */
export function businessDayLabel(hour: number): string {
  return hour === 0 ? "Gece 00:00" : `${String(hour).padStart(2, "0")}:00`;
}

/**
 * Read the setting into module state. Safe on any failure (falls back to the
 * calendar-day default), so a missing settings row can never blank the tab.
 */
export async function loadBusinessDayStart(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any
): Promise<number> {
  try {
    const { data } = await supabase
      .from("settings")
      .select("value")
      .eq("key", BUSINESS_DAY_START_KEY)
      .maybeSingle();
    return setBusinessDayStart(data?.value ?? BUSINESS_DAY_START_DEFAULT);
  } catch (err) {
    console.warn("[analytics] business day start read failed", err);
    return setBusinessDayStart(BUSINESS_DAY_START_DEFAULT);
  }
}
