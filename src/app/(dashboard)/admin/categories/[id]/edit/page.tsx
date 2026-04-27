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
  const { data, error } = await supabase
    .from("categories")
    .select("*")
    .eq("id", id)
    .single();

  if (error || !data) notFound();

  const update = updateCategory.bind(null, id);

  return (
    <>
      <PageHeader title="Edit Category" subtitle={data.name_en} />
      <CategoryForm action={update} initial={data} />
    </>
  );
}
