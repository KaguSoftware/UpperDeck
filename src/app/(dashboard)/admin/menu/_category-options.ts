type RawCat = { id: string; name_en: string; parent_id: string | null };

/**
 * Returns a flat list of selectable categories for menu items.
 * - If a category has children, only the children appear (prefixed with parent name).
 * - If a category has no children, it appears as-is.
 */
export function buildCategoryOptions(all: RawCat[]): { id: string; name_en: string }[] {
  const childIds = new Set(all.filter((c) => c.parent_id).map((c) => c.id));
  const parentIds = new Set(all.filter((c) => c.parent_id).map((c) => c.parent_id!));

  const result: { id: string; name_en: string }[] = [];

  for (const cat of all) {
    if (cat.parent_id) {
      // it's a child — always include, label as "Parent > Child"
      const parent = all.find((p) => p.id === cat.parent_id);
      result.push({ id: cat.id, name_en: parent ? `${parent.name_en} › ${cat.name_en}` : cat.name_en });
    } else if (!parentIds.has(cat.id)) {
      // top-level with no children — include as leaf
      result.push({ id: cat.id, name_en: cat.name_en });
    }
    // top-level with children: skip (items go to the children)
  }

  return result;
}
