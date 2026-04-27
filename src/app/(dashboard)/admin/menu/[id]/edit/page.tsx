import { notFound } from "next/navigation";
import { getServerClient } from "@/lib/supabase/server";
import { PageHeader } from "../../../_components";
import { MenuItemForm } from "../../_form";
import { updateItem } from "../../actions";

export const dynamic = "force-dynamic";

export default async function EditItemPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await getServerClient();

  const [itemRes, catRes] = await Promise.all([
    supabase.from("menu_items").select("*").eq("id", id).single(),
    supabase.from("categories").select("id, name_en").order("sort_order"),
  ]);

  if (itemRes.error || !itemRes.data) notFound();

  const update = updateItem.bind(null, id);

  return (
    <>
      <PageHeader title="Edit Item" subtitle={itemRes.data.name_en} />
      <MenuItemForm action={update} categories={catRes.data ?? []} initial={itemRes.data} />
    </>
  );
}
