import { getServerClient } from "@/lib/supabase/server";
import { PageHeader } from "../../_components";
import { CategoryForm } from "../_form";
import { createCategory } from "../actions";


export default async function NewCategoryPage({
  searchParams,
}: {
  searchParams: Promise<{ parent?: string }>;
}) {
  const { parent } = await searchParams;
  const supabase = await getServerClient();
  const { data: parents } = await supabase
    .from("categories")
    .select("id, name_en")
    .is("parent_id", null)
    .order("sort_order");

  return (
    <>
      <PageHeader title="Yeni Kategori" />
      <CategoryForm
        action={createCategory}
        parentOptions={parents ?? []}
        initial={{ parent_id: parent ?? null }}
      />
    </>
  );
}
