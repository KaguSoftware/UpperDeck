import Link from "next/link";
import { getServerClient } from "@/lib/supabase/server";
import { PageHeader, GhostButton, DangerButton } from "../_components";
import { deleteCategory } from "./actions";

export const dynamic = "force-dynamic";

export default async function CategoriesList() {
  const supabase = await getServerClient();
  const { data, error } = await supabase
    .from("categories")
    .select("id, slug, name_en, name_tr, sort_order")
    .order("sort_order");

  if (error) throw new Error(error.message);

  return (
    <>
      <PageHeader
        title="Categories"
        subtitle={`${data?.length ?? 0} total`}
        action={
          <Link
            href="/admin/categories/new"
            className="bg-orange text-white px-4 py-2.5 font-ui font-extrabold text-[11px] tracking-[0.22em] uppercase"
          >
            + New Category
          </Link>
        }
      />

      <div className="border-2 border-green bg-white overflow-x-auto">
        <div className="min-w-xl">
          <div className="grid grid-cols-[5rem_1fr_1fr_1fr_8rem] gap-3 px-4 py-3 border-b-2 border-green bg-bg-deep text-[10px] font-extrabold uppercase tracking-[0.18em] text-green">
            <div>Order</div>
            <div>Slug</div>
            <div>EN</div>
            <div>TR</div>
            <div></div>
          </div>
          {(data ?? []).map((c) => (
            <div
              key={c.id}
              className="grid grid-cols-[5rem_1fr_1fr_1fr_8rem] gap-3 items-center px-4 py-3 border-b border-green/20 last:border-b-0"
            >
              <div className="font-bowlby text-[18px] text-orange leading-none">{c.sort_order}</div>
              <div className="font-mono text-[12px] text-green/80">{c.slug}</div>
              <div className="font-bowlby text-[14px] uppercase text-green leading-none">
                {c.name_en}
              </div>
              <div className="font-bowlby text-[14px] uppercase text-green leading-none">
                {c.name_tr}
              </div>
              <div className="flex justify-end gap-2">
                <GhostButton href={`/admin/categories/${c.id}/edit`}>Edit</GhostButton>
                <form action={deleteCategory}>
                  <input type="hidden" name="id" value={c.id} />
                  <DangerButton>Del</DangerButton>
                </form>
              </div>
            </div>
          ))}
          {(!data || data.length === 0) && (
            <div className="px-4 py-10 text-center text-[12px] text-green/60 font-semibold uppercase tracking-[0.18em]">
              No categories yet
            </div>
          )}
        </div>
      </div>
    </>
  );
}
