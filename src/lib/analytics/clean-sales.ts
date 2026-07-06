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
  zeroDropped: number;
  duplicatesMerged: number;
};

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

/** Trim, collapse whitespace, Turkish-aware title-case. */
export function normalizeItemName(name: string): string {
  return name
    .trim()
    .replace(/\s+/g, " ")
    .toLocaleLowerCase("tr")
    .replace(/(^|\s)(\S)/g, (_, sep: string, ch: string) => sep + ch.toLocaleUpperCase("tr"));
}

/** True if the line looks like a POS modifier/option row, not an actual item. */
export function isModifierLine(name: string): boolean {
  return MODIFIER_PATTERNS.some((re) => re.test(name));
}

/**
 * Drop modifier lines and zero-qty rows, normalize names, and merge duplicate
 * (entry_id, name) rows by summing qty/revenue.
 */
export function cleanItemRows(rows: RawItemRow[]): { rows: RawItemRow[]; stats: CleanStats } {
  const stats: CleanStats = { modifiersDropped: 0, zeroDropped: 0, duplicatesMerged: 0 };
  const merged = new Map<string, RawItemRow>();

  for (const row of rows) {
    if (isModifierLine(row.item_name.trim())) {
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
