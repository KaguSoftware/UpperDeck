import type { DateRange } from "@/lib/analytics/sales";

export type RangePreset = "today" | "7d" | "30d" | "90d" | "custom";

function iso(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/**
 * Resolve a date range from URL search params. Supports presets and an explicit
 * `from`/`to` custom range (used to match an uploaded sheet's period).
 * Defaults to the last 30 days.
 */
export function resolveRange(params: { range?: string; from?: string; to?: string }): {
  preset: RangePreset;
  range: DateRange;
} {
  const today = new Date();
  const re = /^\d{4}-\d{2}-\d{2}$/;

  if (params.range === "custom" && params.from && params.to && re.test(params.from) && re.test(params.to)) {
    return { preset: "custom", range: { from: params.from, to: params.to } };
  }

  const preset = (["today", "7d", "30d", "90d"].includes(params.range ?? "")
    ? params.range
    : "30d") as RangePreset;

  const days = preset === "today" ? 0 : preset === "7d" ? 6 : preset === "90d" ? 89 : 29;
  const from = new Date(today);
  from.setDate(today.getDate() - days);

  return { preset, range: { from: iso(from), to: iso(today) } };
}
