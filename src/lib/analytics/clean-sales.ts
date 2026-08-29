// Cleaning rules for imported POS "Items" rows. All heuristics live here —
// tune the regexes below if a legit menu item gets dropped.

export type RawItemRow = {
  entry_id: string;
  item_name: string;
  qty: number;
  revenue: number | null;
};

export type CleanStats = {
  modifiersDropped: number;
  notesDropped: number;
  zeroDropped: number;
  duplicatesMerged: number;
};

/** Why a raw POS line never became a `sales_entry_items` row. */
export type DropReason = "modifier" | "note" | "zero";

/**
 * A line the cleaner removed, kept rather than discarded.
 *
 * Two reasons it has to survive the import:
 *  1. the rules are heuristics, so a real product WILL occasionally be dropped —
 *     without a list of what went, that's an invisible hole in the sales figures
 *     with no way to notice or debug it;
 *  2. modifier lines carry real demand ("Mayonezsiz" ×43, "2 Menü" ×61) that is
 *     worth reading even though it isn't a dish.
 *
 * `entry_id` is retained so a line judged a genuine product can be put back
 * without re-importing the workbook.
 */
export type DroppedRow = {
  entry_id: string;
  item_name: string;
  qty: number;
  revenue: number | null;
  reason: DropReason;
};

// POS order-note lines that get exported as if they were menu items
// ("Mesaj", "Mesaj: az pişmiş", "Müşteri Notu …"). They carry a diner's note,
// not a sold product, so they should never reach `sales_entry_items`.
const NOTE_PATTERNS: RegExp[] = [
  /^mesaj\b/i, // "Mesaj", "Mesaj:", "Mesaj - ..."
  /^(müşteri|sipariş|masa)\s*not/i, // "Müşteri Notu", "Sipariş Notu"
];

const MODIFIER_PATTERNS: RegExp[] = [
  // trailing price adjustment: "no tomatoes +0", "extra cheese +15", "çift kaşar +25 TL"
  /[+±]\s*\d+([.,]\d+)?\s*(₺|tl)?$/i,
  // leading English negation/extras
  /^(no|without|extra|add)\s/i,
  // leading Turkish extras/portion modifiers
  /^(ekstra|ilave|az|bol|çift)\s/i,
  // trailing Turkish negation: "soğan yok", "sos olmasın"
  /\s(yok|olmasın|istemiyor(um)?)$/i,
  // leading list/option markers
  /^[-–—*>+]\s?/,
];

// Control (Cc: NUL, stray tabs, …) and format (Cf: zero-width space/joiner, BOM)
// characters that sneak in from POS/Excel exports. trim() and \s miss several of
// them, and a single invisible char silently breaks name matching ("0 sold").
const INVISIBLE = /[\p{Cc}\p{Cf}]/gu;

/** Strip invisibles, collapse whitespace, trim, Turkish-aware title-case. */
export function normalizeItemName(name: string): string {
  return name
    .replace(INVISIBLE, " ")
    .trim()
    .replace(/\s+/g, " ")
    .toLocaleLowerCase("tr")
    .replace(/(^|\s)(\S)/g, (_, sep: string, ch: string) => sep + ch.toLocaleUpperCase("tr"));
}

/**
 * POS/kitchen product names that differ from the customer-facing MENU names.
 *
 * PostHog engagement is tracked under the menu name, while the sales sheet often
 * exports a different kitchen name — so the two never line up on their own and the
 * item reads "0 sold". Map each variant (normalized, lower-case) → the canonical
 * menu name so real sales correlate with engagement.
 *
 * Add a line per mismatch: `[normalized sheet name]: "Menu Name"`. The key must be
 * the sheet name lower-cased (spaces collapsed); the value is shown in the charts.
 */
const NAME_ALIASES: Record<string, string> = {
  "oklahoma smash": "Oklahoma Onion",
  "oklahama onion": "Oklahoma Onion", // Turkish menu-name typo — folds the en/tr view split
  "simple smash burger": "Simple Smash",
  "wild eggy smash": "Wild Eggy",
  "biroche ekmeği": "Brioche Ekmeği",
  "peanut pancake": "Pancake",

  // Waffles. NOTE the dotless "ı" in "berries & ıce cream": normalizeItemName
  // title-cases under Turkish rules ("ice" → "İce"), and the lookup then lowers
  // "İ" → "ı". Every key holding an English "i" that starts a word must be
  // written with "ı" here or it can never match. Same for "ıce cream" below.
  "berries & ıce cream waffle": "Berries Ice Cream Waffle",
  "apple & cinnamon & caramel waffle": "Apple & Cinnamon Waffle",

  // Buns
  "veggy bun": "Vegy Bun",

  // Fries — the en/tr split plus the "Patates Kızartması" long-form variants
  "truf gravyer patates": "Truf & Parmesan",
  "trüf parmesanlı patates kızartması": "Truf & Parmesan",
  "patates kızartması truf & parmesanlı": "Truf & Parmesan",
  "truffle parmesan fries": "Truf & Parmesan",
  "cheddarlı patates kızartması": "Cheddar",
  "cheddar patates kızartması": "Cheddar",
  "tuzlu sirkeli patates kızartması": "Tuzlu Sirkeli Patates",
  "baharatlı patates kızartması": "Baharatlı Patates",
  "spicy fries": "Baharatlı Patates",

  // Milkshakes
  "çilekli milkshake": "Çilek Milkshake",
  "pink milkshake": "Çilek Milkshake",
  "strawberry milkshake": "Çilek Milkshake",
  "banana milkshake": "Muzlu Milkshake",

  // Coffee — note "İce" (dotted capital İ) is the POS spelling, "Ice" the menu's.
  // İce Caramel Latte is deliberately NOT folded into İce Latte: caramel is a
  // separate product, not a spelling of the plain one.
  "filtre kahve": "Filtre Kahvesi",
  "filter coffee": "Filtre Kahvesi",
  "ice filtre kahve": "Ice Filtre Kahve",
};

/**
 * Canonical menu name for any raw item name (from PostHog OR the sales sheet):
 * normalize, then fold known kitchen-name variants onto their menu name. This is
 * the single key both analytics sources should be matched/displayed by.
 */
export function canonicalItemName(name: string): string {
  const normalized = normalizeItemName(name);
  return NAME_ALIASES[normalized.toLocaleLowerCase("tr")] ?? normalized;
}

/** True if the line looks like a POS modifier/option row, not an actual item. */
export function isModifierLine(name: string): boolean {
  return MODIFIER_PATTERNS.some((re) => re.test(name));
}

/** True if the line is a POS order-note ("Mesaj", "Müşteri Notu"), not an item. */
export function isNoteLine(name: string): boolean {
  return NOTE_PATTERNS.some((re) => re.test(name.trim()));
}

/**
 * Owner-supplied corrections applied to every import, both directions:
 *  - `aliases`: raw POS name (normalized, lower-case) → the menu name it means.
 *    Written by the import review screen when the owner maps an unrecognised
 *    line, so the next import folds it automatically instead of asking again.
 *  - `forceKeep`: names the owner declared real products despite matching a
 *    modifier/note pattern — the escape hatch for a heuristic that got it wrong
 *    ("Az Pişmiş Burger" is a dish; the `^az ` rule disagrees).
 */
export type CleanOverrides = {
  aliases?: Record<string, string>;
  forceKeep?: string[];
};

/** The key both override maps are looked up by. */
const overrideKey = (name: string) => normalizeItemName(name).toLocaleLowerCase("tr");

/**
 * Drop note lines, modifier lines and zero-qty rows, normalize names, and merge
 * duplicate (entry_id, name) rows by summing qty/revenue.
 *
 * Dropped lines are RETURNED, not discarded — see `DroppedRow`. The caller
 * persists them so the owner can audit what the heuristics removed and put back
 * anything they got wrong.
 */
export function cleanItemRows(
  rows: RawItemRow[],
  overrides: CleanOverrides = {}
): { rows: RawItemRow[]; stats: CleanStats; dropped: DroppedRow[] } {
  const stats: CleanStats = { modifiersDropped: 0, notesDropped: 0, zeroDropped: 0, duplicatesMerged: 0 };
  const merged = new Map<string, RawItemRow>();
  const dropped: DroppedRow[] = [];

  const aliases = overrides.aliases ?? {};
  const forceKeep = new Set((overrides.forceKeep ?? []).map(overrideKey));

  for (const row of rows) {
    const name = row.item_name.trim();
    const key = overrideKey(name);
    const kept = forceKeep.has(key);

    if (!kept && isNoteLine(name)) {
      stats.notesDropped++;
      dropped.push({ ...row, item_name: normalizeItemName(name), reason: "note" });
      continue;
    }
    if (!kept && isModifierLine(name)) {
      stats.modifiersDropped++;
      dropped.push({ ...row, item_name: normalizeItemName(name), reason: "modifier" });
      continue;
    }
    if (row.qty <= 0) {
      stats.zeroDropped++;
      dropped.push({ ...row, item_name: normalizeItemName(name), reason: "zero" });
      continue;
    }
    // Owner mapping wins over the static alias table, which normalizeItemName
    // alone wouldn't apply anyway — canonicalItemName does that downstream.
    const item_name = aliases[key] ? normalizeItemName(aliases[key]) : normalizeItemName(row.item_name);
    const mergeKey = `${row.entry_id} ${item_name.toLocaleLowerCase("tr")}`;
    const existing = merged.get(mergeKey);
    if (existing) {
      existing.qty += row.qty;
      if (row.revenue != null) existing.revenue = (existing.revenue ?? 0) + row.revenue;
      stats.duplicatesMerged++;
    } else {
      merged.set(mergeKey, { ...row, item_name });
    }
  }

  return { rows: [...merged.values()], stats, dropped };
}
