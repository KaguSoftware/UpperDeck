import Link from "next/link";
import { getServerClient } from "@/lib/supabase/server";
import { PageHeader } from "../_components";
import { CategoriesList } from "./_list";

export const dynamic = "force-dynamic";

export default async function CategoriesPage() {
  const supabase = await getServerClient();
  const { data, error } = await supabase
    .from("categories")
    .select("id, slug, name_en, name_tr, sort_order, image_url, emoji, parent_id")
    .order("sort_order");

  if (error) throw new Error(error.message);

  const all = data ?? [];
  const parents = all.filter((c) => !c.parent_id);

  return (
    <>
      <PageHeader
        title="Kategoriler"
        subtitle={`${parents.length} üst düzey · ${all.length - parents.length} alt`}
        action={
          <Link
            href="/admin/categories/new"
            className="bg-orange text-white px-4 py-2.5 font-ui font-extrabold text-[11px] tracking-[0.22em] uppercase"
          >
            + Yeni Kategori
          </Link>
        }
      />
      <CategoriesList initial={all} />
    </>
  );
}
