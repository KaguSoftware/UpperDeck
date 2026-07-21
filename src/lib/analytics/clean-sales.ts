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
  "truf gravyer patates": "Truffle Parmesan Fries",
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
 * Drop note lines, modifier lines and zero-qty rows, normalize names, and merge
 * duplicate (entry_id, name) rows by summing qty/revenue.
 */
export function cleanItemRows(rows: RawItemRow[]): { rows: RawItemRow[]; stats: CleanStats } {
  const stats: CleanStats = { modifiersDropped: 0, notesDropped: 0, zeroDropped: 0, duplicatesMerged: 0 };
  const merged = new Map<string, RawItemRow>();

  for (const row of rows) {
    const name = row.item_name.trim();
    if (isNoteLine(name)) {
      stats.notesDropped++;
      continue;
    }
    if (isModifierLine(name)) {
      stats.modifiersDropped++;
      continue;
    }
    if (row.qty <= 0) {
      stats.zeroDropped++;
      continue;
    }
    const item_name = normalizeItemName(row.item_name);
    const key = `${row.entry_id} ${item_name.toLocaleLowerCase("tr")}`;
    const existing = merged.get(key);
    if (existing) {
      existing.qty += row.qty;
      if (row.revenue != null) existing.revenue = (existing.revenue ?? 0) + row.revenue;
      stats.duplicatesMerged++;
    } else {
      merged.set(key, { ...row, item_name });
    }
  }

  return { rows: [...merged.values()], stats };
}
