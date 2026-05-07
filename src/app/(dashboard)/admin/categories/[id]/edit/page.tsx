import { notFound } from "next/navigation";
import { getServerClient } from "@/lib/supabase/server";
import { PageHeader } from "../../../_components";
import { CategoryForm } from "../../_form";
import { updateCategory } from "../../actions";

export const dynamic = "force-dynamic";

export default async function EditCategoryPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await getServerClient();
  const [{ data, error }, { data: parents }] = await Promise.all([
    supabase.from("categories").select("*").eq("id", id).single(),
    supabase.from("categories").select("id, name_en").is("parent_id", null).order("sort_order"),
  ]);

  if (error || !data) notFound();

  // exclude self from parent options
  const parentOptions = (parents ?? []).filter((p) => p.id !== id);
  const update = updateCategory.bind(null, id);

  return (
    <>
      <PageHeader title="Kategoriyi Düzenle" subtitle={data.name_en} />
      <CategoryForm action={update} initial={data} parentOptions={parentOptions} />
    </>
  );
}
