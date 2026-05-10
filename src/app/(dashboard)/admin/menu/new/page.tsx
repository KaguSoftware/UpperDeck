import { getServerClient } from "@/lib/supabase/server";
import { PageHeader } from "../../_components";
import { MenuItemForm } from "../_form";
import { createItem } from "../actions";
import { buildCategoryOptions } from "../_category-options";


export default async function NewItemPage() {
  const supabase = await getServerClient();
  const { data: allCats } = await supabase
    .from("categories")
    .select("id, name_en, parent_id")
    .order("sort_order");

  const categories = buildCategoryOptions(allCats ?? []);

  return (
    <>
      <PageHeader title="Yeni Ürün" subtitle="Menüye ekle" />
      <MenuItemForm action={createItem} categories={categories} />
    </>
  );
}
