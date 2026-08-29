import "server-only";
import { canonicalItemName } from "@/lib/analytics/clean-sales";
import { buildMenuMatcher, type MenuMatcher } from "@/lib/analytics/menu-match";

/**
 * Owner-configured "ignore these items" rules for the analytics tab.
 *
 * Two rules, both stored in the key/value `settings` table:
 *
 *  1. A MANUAL list of item names to ignore. Some menu entries dominate the
 *     item-level charts without carrying any signal — e.g. an upsell like "Menu
 *     Upgrade" tops views/carts/best-sellers on every range but tells the owner
 *     nothing.
 *  2. An AUTO toggle that additionally ignores every item that is no longer on the
 *     menu (see `menu-match.ts` for how loosely "on the menu" is matched).
 *     Delisted products keep showing up in the historical sales/engagement data
 *     forever, so without this the charts and the AI keep analysing dishes the
 *     kitchen stopped serving.
 *  3. Per-item OVERRIDES of that rule — the escape hatch for a product the matcher
 *     called delisted but the owner knows is live. Cleared whenever the toggle is
 *     flipped, so switching it off and on re-applies the rule from scratch.
 *
 * All of them omit items from the INSIGHT-level views (top viewed/carted,
 * conversion, abandoned, best-sellers → and therefore the deterministic Overview
 * and the AI insights) so the analysis focuses on products actually being sold.
 *
 * They deliberately do NOT touch money/amount aggregates (total sales, covers,
 * average spend, total views, funnel counts): those stay complete.
 */

export const EXCLUDED_ITEMS_SETTINGS_KEY = "analytics_excluded_items";
export const AUTO_EXCLUDE_OFFMENU_SETTINGS_KEY = "analytics_auto_exclude_offmenu";
export const OFFMENU_OVERRIDES_SETTINGS_KEY = "analytics_offmenu_overrides";

/**
 * Shared match key — same CANONICAL key compare.ts / price-bands.ts / patterns.ts
 * use to line up PostHog menu names with POS item names, so an exclusion entered
 * once matches both sources.
 *
 * It folds kitchen-name aliases too (`canonicalItemName`, not just
 * `normalizeItemName`): several callers hand `keep()` a RAW sheet name
 * ("Oklahoma Smash") while the charts and patterns display the canonical menu
 * name ("Oklahoma Onion"). Keying on the normalized form alone let the raw
 * variant slip past an exclusion the owner had already ticked.
 */
export const itemKey = (name: string) => canonicalItemName(name).toLocaleLowerCase("tr");

/** Everything needed to decide whether an item name is ignored. */
export type ExclusionRules = {
  /** Owner-ticked names, in their display form. */
  manual: string[];
  /** "Also ignore anything no longer on the menu" toggle. */
  autoOffMenu: boolean;
  /** Names the owner force-kept despite the auto rule calling them off-menu. */
  overrides: string[];
  /**
   * Matcher over every name currently on the menu (items + add-on options, en and
   * tr). null means "unknown" — the auto rule then does nothing, so a failed or
   * empty menu read can never blank out the whole dashboard.
   */
  menu: MenuMatcher | null;
};

/** Parse the stored JSON array of ignored names. Safe ([]) on any failure. */
function parseExcludedItems(raw: unknown): string[] {
  if (typeof raw !== "string" || !raw) return [];
  try {
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr.map(String).filter(Boolean) : [];
  } catch {
    return [];
  }
}

/**
 * Matcher over every name that currently exists on the menu.
 *
 * Add-on option labels count as "on the menu" too: extras like "Ekstra Kaşar" are
 * sold and exported by the POS as their own item lines, so reading only
 * `menu_items` would auto-ignore products the kitchen still serves.
 */
async function getMenuMatcher(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any
): Promise<MenuMatcher | null> {
  const [{ data: items, error: itemsError }, { data: options }] = await Promise.all([
    supabase.from("menu_items").select("name_en, name_tr"),
    supabase.from("addon_options").select("label_en, label_tr"),
  ]);
  if (itemsError) {
    console.warn("[analytics] menu name read failed — auto ignore disabled", itemsError.message);
    return null;
  }
  const names: string[] = [];
  for (const r of (items ?? []) as { name_en: string; name_tr: string }[]) {
    names.push(r.name_en, r.name_tr);
  }
  for (const r of (options ?? []) as { label_en: string; label_tr: string }[]) {
    names.push(r.label_en, r.label_tr);
  }
  const matcher = buildMenuMatcher(names.filter((n) => typeof n === "string" && n.trim()));
  // An empty menu is indistinguishable from a menu we failed to read, and acting
  // on it would hide every product. Treat it as unknown.
  return matcher.size > 0 ? matcher : null;
}

/**
 * Read all three ignore rules in one settings query. The menu snapshot is only
 * fetched when the auto rule is on, so the default path costs what it used to.
 */
export async function getExclusionRules(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any
): Promise<ExclusionRules> {
  const { data } = await supabase
    .from("settings")
    .select("key, value")
    .in("key", [
      EXCLUDED_ITEMS_SETTINGS_KEY,
      AUTO_EXCLUDE_OFFMENU_SETTINGS_KEY,
      OFFMENU_OVERRIDES_SETTINGS_KEY,
    ]);
  const rows = (data ?? []) as { key: string; value: string }[];
  const valueOf = (key: string) => rows.find((r) => r.key === key)?.value;

  const manual = parseExcludedItems(valueOf(EXCLUDED_ITEMS_SETTINGS_KEY));
  const autoOffMenu = valueOf(AUTO_EXCLUDE_OFFMENU_SETTINGS_KEY) === "1";
  const overrides = autoOffMenu ? parseExcludedItems(valueOf(OFFMENU_OVERRIDES_SETTINGS_KEY)) : [];

  return {
    manual,
    autoOffMenu,
    overrides,
    menu: autoOffMenu ? await getMenuMatcher(supabase) : null,
  };
}

/** True when the auto rule is on AND we actually know what's on the menu. */
function autoActive(rules: ExclusionRules): rules is ExclusionRules & { menu: MenuMatcher } {
  return rules.autoOffMenu && rules.menu !== null;
}

/** Predicate that keeps only item names no rule ignores (by match key). */
export function makeKeepFilter(rules: ExclusionRules): (name: string) => boolean {
  const manualKeys = new Set(rules.manual.map(itemKey));
  if (!autoActive(rules)) return (name: string) => !manualKeys.has(itemKey(name));

  const overrideKeys = new Set(rules.overrides.map(itemKey));
  const { menu } = rules;
  return (name: string) => {
    const k = itemKey(name);
    if (manualKeys.has(k)) return false;
    return overrideKeys.has(k) || menu.onMenu(name);
  };
}

/**
 * The names from `universe` that the AUTO rule applies to — off the menu, and not
 * already ticked manually. Needed wherever an actual name list is required rather
 * than a predicate: the dropdown's "menü dışı" markers and the AI mention filter.
 *
 * By default these are the names actually being dropped; `includeOverridden` also
 * returns the ones the owner force-kept, which is what lets the dropdown show a
 * live product as off-menu-but-included rather than silently unmarked.
 */
export function pickOffMenu(
  rules: ExclusionRules,
  universe: string[],
  { includeOverridden = false } = {}
): string[] {
  if (!autoActive(rules)) return [];
  const manualKeys = new Set(rules.manual.map(itemKey));
  const overrideKeys = new Set(rules.overrides.map(itemKey));
  const seen = new Set<string>();
  const out: string[] = [];
  for (const name of universe) {
    const k = itemKey(name);
    if (seen.has(k) || manualKeys.has(k)) continue;
    if (!includeOverridden && overrideKeys.has(k)) continue;
    if (rules.menu.onMenu(name)) continue;
    seen.add(k);
    out.push(name);
  }
  return out;
}

/** 32-bit FNV-1a — just a short stable digest for the cache key, not a checksum. */
function digest(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(36);
}

/**
 * Cache-key fragment identifying the active rules, so a change to any of them
 * regenerates instead of serving findings/patterns built under the old ones.
 * The auto rule folds in a digest of the menu snapshot and the overrides: editing
 * either changes what it ignores, and that has to invalidate too.
 */
export function exclusionSignature(rules: ExclusionRules): string {
  const manual = rules.manual.length ? `|x:${rules.manual.map(itemKey).sort().join(",")}` : "";
  if (!autoActive(rules)) return manual;
  const overrides = rules.overrides.length ? `|keep:${rules.overrides.map(itemKey).sort().join(",")}` : "";
  return `${manual}|offmenu:${digest(rules.menu.digest)}${overrides}`;
}

/**
 * Drop freeform AI lines (findings / pattern sentences) that NAME an excluded
 * item. A safety net for reused or persisted sets that were generated before the
 * owner excluded the item: generation already filters item-level inputs, but a
 * stored set from an earlier run can still mention it, so we strip those on reuse.
 * Case-insensitive substring match on the display name (Turkish locale).
 */
export function dropExcludedMentions(texts: string[], excluded: string[]): string[] {
  if (!excluded.length) return texts;
  const needles = excluded.map((n) => n.trim().toLocaleLowerCase("tr")).filter((n) => n.length >= 2);
  if (!needles.length) return texts;
  return texts.filter((t) => {
    const low = t.toLocaleLowerCase("tr");
    return !needles.some((n) => low.includes(n));
  });
}

/** Trim, drop blanks, and dedupe by match key while keeping the display form. */
export function normalizeExclusionList(names: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const n of names) {
    const t = String(n).trim();
    if (!t) continue;
    const k = itemKey(t);
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(t);
  }
  return out;
}
