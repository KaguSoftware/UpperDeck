import { getServerClient } from "@/lib/supabase/server";
import { PageHeader } from "../../_components";
import { MenuItemForm } from "../_form";
import { createItem } from "../actions";

export const dynamic = "force-dynamic";

export default async function NewItemPage() {
  const supabase = await getServerClient();
  const { data: categories } = await supabase
    .from("categories")
    .select("id, name_en")
    .order("sort_order");

  return (
    <>
      <PageHeader title="New Item" subtitle="Add to menu" />
      <MenuItemForm action={createItem} categories={categories ?? []} />
    </>
  );
}
