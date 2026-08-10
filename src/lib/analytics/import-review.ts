import "server-only";
import { canonicalItemName, type DroppedRow, type DropReason } from "@/lib/analytics/clean-sales";
import { buildMenuMatcher, type MenuSuggestion } from "@/lib/analytics/menu-match";

/**
 * The import review: what the POS import actually did to every product line.
 *
 * The import runs three heuristics in a row — note-line detection, modifier-line
 * detection, and (downstream, at read time) the "no longer on the menu" auto-hide
 * — and until now all three were silent. A month's import could report "105 rows
 * cleaned" while a real dish sat in that number, and nothing on screen could tell
 * the owner which one. Meanwhile the modifier lines it removed ("Mayonezsiz" ×43,
 * "2 Menü" ×61) are real demand signal that was being thrown in the bin.
 *
 * So every import now writes a report:
 *  - each distinct product name with its quantity, revenue and day count;
 *  - whether it MATCHED something on the menu, or is unrecognised and needs
 *    mapping (with fuzzy candidates from the real menu);
 *  - every line the cleaner dropped, why, and enough detail (entry_id/qty) to put
 *    it back without re-importing the workbook.
 *
 * The report lives in the key/value `settings` table rather than its own table:
 * it's a single latest-import document, replaced wholesale on each import.
 */

/** Latest import report. */
export const IMPORT_REVIEW_SETTINGS_KEY = "analytics_last_import_review";
/** Owner mappings: normalized raw POS name → menu name. Applied on every import. */
export const ITEM_ALIASES_SETTINGS_KEY = "analytics_item_aliases";
/** Names the owner declared real products despite matching a modifier/note rule. */
export const FORCE_ITEM_NAMES_SETTINGS_KEY = "analytics_force_item_names";

/** What the owner did about a reviewed line. */
export type ReviewResolution = {
  action: "mapped" | "ignored" | "restored";
  /** Menu name it was mapped onto (mapped only). */
  to?: string;
  at: string;
};

export type ReviewStatus =
  /** Kept, and matches something currently on the menu — nothing to do. */
  | "matched"
  /** Kept, but no menu entry resembles it — the line that needs mapping. */
  | "unmatched"
  /** Dropped as a modifier/option line ("1 İ Mayonezsiz", "2 Menü"). */
  | "modifier"
  /** Dropped as an order note ("Mesaj: az pişmiş"). */
  | "note"
  /** Dropped for a non-positive quantity. */
  | "zero";

export type ImportReviewRow = {
  name: string;
  qty: number;
  revenue: number;
  /** Distinct days the name appears on — separates a one-off from a standing line. */
  days: number;
  status: ReviewStatus;
  /** Menu candidates, strongest first. Empty when nothing is close enough. */
  suggestions: MenuSuggestion[];
  resolution?: ReviewResolution;
};

export type ImportReview = {
  importedAt: string;
  rangeFrom: string;
  rangeTo: string;
  /** Source sheet name, or "" for the simple template. */
  sheet: string;
  /** Distinct menu names the matcher was built from; 0 = menu unreadable. */
  menuSize: number;
  totals: {
    /** Distinct product names seen in the file. */
    names: number;
    matched: number;
    unmatched: number;
    dropped: number;
  };
  rows: ImportReviewRow[];
  /**
   * Dropped lines with their entry, aggregated per (entry, name), so "this is a
   * real product" can re-insert them. Bounded — see MAX_DROPPED_DETAIL.
   */
  droppedDetail: { entry_id: string; item_name: string; qty: number; revenue: number | null }[];
  /** True when droppedDetail was truncated; restore then needs a re-import. */
  droppedDetailTruncated: boolean;
};

/**
 * Ceiling on the restore-detail payload. A month of a busy kitchen is a few
 * thousand dropped lines; past this the report is a liability in a settings row
 * and the aggregate counts (which are never truncated) are enough to audit.
 */
const MAX_DROPPED_DETAIL = 4000;

/** Rows are capped for the same reason — the tail is single-unit noise. */
const MAX_ROWS = 400;

type KeptRow = { entry_date: string; item_name: string; qty: number; revenue: number | null };

/** Parse a stored JSON object of aliases. Safe ({}) on any failure. */
export function parseAliases(raw: unknown): Record<string, string> {
  if (typeof raw !== "string" || !raw) return {};
  try {
    const obj = JSON.parse(raw);
    if (!obj || typeof obj !== "object" || Array.isArray(obj)) return {};
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
      const key = String(k).trim().toLocaleLowerCase("tr");
      const value = String(v).trim();
      if (key && value) out[key] = value;
    }
    return out;
  } catch {
    return {};
  }
}

/** Parse a stored JSON array of names. Safe ([]) on any failure. */
export function parseNameList(raw: unknown): string[] {
  if (typeof raw !== "string" || !raw) return [];
  try {
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr.map(String).map((s) => s.trim()).filter(Boolean) : [];
  } catch {
    return [];
  }
}

/** Parse the stored report. null when absent or unreadable. */
export function parseImportReview(raw: unknown): ImportReview | null {
  if (typeof raw !== "string" || !raw) return null;
  try {
    const obj = JSON.parse(raw);
    if (!obj || typeof obj !== "object" || !Array.isArray((obj as ImportReview).rows)) return null;
    return obj as ImportReview;
  } catch {
    return null;
  }
}

/**
 * Build the report from one import's kept rows and dropped lines.
 *
 * `menuNames` is every name currently on the menu (items + add-on options, both
 * locales) — the same universe the auto-hide rule matches against, so "matched"
 * here means exactly "the auto-hide rule will leave this alone". An empty menu
 * read leaves every row unjudged (`matched`) rather than flagging the whole
 * import, mirroring how the auto rule disarms itself.
 */
export function buildImportReview({
  kept,
  dropped,
  menuNames,
  sheet,
  dateToId,
}: {
  kept: KeptRow[];
  dropped: DroppedRow[];
  menuNames: string[];
  sheet: string;
  /** entry_date → entry_id, for aggregating dropped detail per entry. */
  dateToId: Map<string, string>;
}): ImportReview {
  const matcher = buildMenuMatcher(menuNames);
  const menuKnown = matcher.size > 0;

  type Agg = { name: string; qty: number; revenue: number; days: Set<string>; status: ReviewStatus };
  const byName = new Map<string, Agg>();
  const key = (name: string) => canonicalItemName(name).toLocaleLowerCase("tr");

  const bump = (name: string, qty: number, revenue: number | null, day: string, status: ReviewStatus) => {
    const k = key(name);
    let a = byName.get(k);
    if (!a) {
      a = { name: canonicalItemName(name), qty: 0, revenue: 0, days: new Set(), status };
      byName.set(k, a);
    }
    a.qty += qty;
    a.revenue += revenue ?? 0;
    a.days.add(day);
    return a;
  };

  for (const r of kept) {
    // Unjudged when we couldn't read the menu — never flag 89 products because a
    // single query failed.
    const status: ReviewStatus = !menuKnown || matcher.onMenu(r.item_name) ? "matched" : "unmatched";
    bump(r.item_name, r.qty, r.revenue, r.entry_date, status);
  }

  // Dropped lines carry an entry_id, not a date — invert the map the caller used
  // to write them so both sides aggregate on the same day key.
  const idToDate = new Map([...dateToId].map(([date, id]) => [id, date]));
  const dropReasonRank: Record<DropReason, number> = { modifier: 0, note: 1, zero: 2 };
  const detailByPair = new Map<string, { entry_id: string; item_name: string; qty: number; revenue: number | null }>();

  for (const d of dropped) {
    const day = idToDate.get(d.entry_id) ?? d.entry_id;
    const a = bump(d.item_name, d.qty, d.revenue, day, d.reason);
    // A name dropped for several reasons keeps the most informative one.
    if (a.status !== "matched" && a.status !== "unmatched") {
      const cur = a.status as DropReason;
      if (dropReasonRank[d.reason] < dropReasonRank[cur]) a.status = d.reason;
    }

    const pair = `${d.entry_id} ${key(d.item_name)}`;
    const existing = detailByPair.get(pair);
    if (existing) {
      existing.qty += d.qty;
      if (d.revenue != null) existing.revenue = (existing.revenue ?? 0) + d.revenue;
    } else {
      detailByPair.set(pair, {
        entry_id: d.entry_id,
        item_name: canonicalItemName(d.item_name),
        qty: d.qty,
        revenue: d.revenue,
      });
    }
  }

  const rows: ImportReviewRow[] = [...byName.values()]
    .map((a) => ({
      name: a.name,
      qty: a.qty,
      revenue: Math.round(a.revenue * 100) / 100,
      days: a.days.size,
      status: a.status,
      // Only the lines that need a decision get candidates; a matched product has
      // nothing to map to and the scan is O(menu) per name.
      suggestions: a.status === "matched" ? [] : matcher.suggest(a.name),
    }))
    // Needs-attention first, then by volume — the biggest unrecognised seller is
    // the one worth mapping, not the alphabetically first.
    .sort((a, b) => statusRank(a.status) - statusRank(b.status) || b.qty - a.qty)
    .slice(0, MAX_ROWS);

  const dates = kept.map((k) => k.entry_date).sort();
  const detail = [...detailByPair.values()];

  return {
    importedAt: new Date().toISOString(),
    rangeFrom: dates[0] ?? "",
    rangeTo: dates[dates.length - 1] ?? "",
    sheet,
    menuSize: matcher.size,
    totals: {
      names: byName.size,
      matched: [...byName.values()].filter((a) => a.status === "matched").length,
      unmatched: [...byName.values()].filter((a) => a.status === "unmatched").length,
      dropped: dropped.length,
    },
    rows,
    droppedDetail: detail.slice(0, MAX_DROPPED_DETAIL),
    droppedDetailTruncated: detail.length > MAX_DROPPED_DETAIL,
  };
}

function statusRank(s: ReviewStatus): number {
  switch (s) {
    case "unmatched":
      return 0;
    case "modifier":
      return 1;
    case "note":
      return 2;
    case "zero":
      return 3;
    default:
      return 4;
  }
}
