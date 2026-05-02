type RawCat = { id: string; name_en: string; parent_id: string | null };

export function buildCategoryOptions(all: RawCat[]): { id: string; name_en: string }[] {
  const parentIds = new Set(all.filter((c) => c.parent_id).map((c) => c.parent_id!));
  const result: { id: string; name_en: string }[] = [];

  for (const cat of all) {
    if (cat.parent_id) {
      // subcategory — label as "Parent › Child"
      const parent = all.find((p) => p.id === cat.parent_id);
      result.push({ id: cat.id, name_en: parent ? `${parent.name_en} › ${cat.name_en}` : cat.name_en });
    } else if (parentIds.has(cat.id)) {
      // top-level with subcategories — include itself first, then subcategories follow
      result.push({ id: cat.id, name_en: cat.name_en });
    } else {
      // top-level with no children
      result.push({ id: cat.id, name_en: cat.name_en });
    }
  }

  return result;
}
