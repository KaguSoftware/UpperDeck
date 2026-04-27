import Link from "next/link";
import { getServerClient } from "@/lib/supabase/server";
import { PageHeader, GhostButton, DangerButton } from "../_components";
import { deleteItem } from "./actions";

export const dynamic = "force-dynamic";

export default async function MenuList() {
  const supabase = await getServerClient();
  const { data, error } = await supabase
    .from("menu_items")
    .select("id, name_en, price, image_url, spicy, is_available, sort_order, category_id, categories(name_en)")
    .order("sort_order", { ascending: true })
    .order("name_en", { ascending: true });

  if (error) throw new Error(error.message);

  return (
    <>
      <PageHeader
        title="Menu"
        subtitle={`${data?.length ?? 0} items`}
        action={
          <Link
            href="/admin/menu/new"
            className="bg-orange text-white px-4 py-2.5 font-ui font-extrabold text-[11px] tracking-[0.22em] uppercase"
          >
            + New Item
          </Link>
        }
      />

      <div className="border-2 border-green bg-white overflow-x-auto">
        <div className="min-w-xl">
          <div className="grid grid-cols-[3rem_minmax(0,1fr)_minmax(0,1fr)_6rem_5rem_8rem] gap-3 px-4 py-3 border-b-2 border-green bg-bg-deep text-[10px] font-extrabold uppercase tracking-[0.18em] text-green">
            <div></div>
            <div>Name</div>
            <div>Category</div>
            <div className="text-right">Price</div>
            <div className="text-center">Status</div>
            <div></div>
          </div>
          {(data ?? []).map((item) => (
            <div
              key={item.id}
              className="grid grid-cols-[3rem_minmax(0,1fr)_minmax(0,1fr)_6rem_5rem_8rem] gap-3 items-center px-4 py-3 border-b border-green/20 last:border-b-0"
            >
              <div className="w-10 h-10 bg-bg-deep border border-green/20 overflow-hidden flex items-center justify-center shrink-0">
                {item.image_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={item.image_url} alt="" className="w-full h-full object-cover" />
                ) : (
                  <span className="text-green/20 text-[18px]">🍽</span>
                )}
              </div>
              <div>
                <div className="font-bowlby text-[15px] uppercase text-green leading-none">
                  {item.name_en}
                </div>
                {item.spicy && (
                  <span className="inline-block mt-1 bg-orange text-white text-[8px] font-extrabold px-1.5 py-0.5 uppercase tracking-[0.15em]">
                    Spicy
                  </span>
                )}
              </div>
              <div className="text-[12px] font-semibold text-green/80">
                {(item.categories as { name_en: string } | null)?.name_en ?? "—"}
              </div>
              <div className="text-right font-ui font-extrabold text-[14px] text-orange">
                {Number(item.price).toFixed(0)} ₺
              </div>
              <div className="text-center">
                <span
                  className={[
                    "inline-block text-[8px] font-extrabold px-1.5 py-0.5 uppercase tracking-[0.15em]",
                    item.is_available ? "bg-green text-bg" : "bg-green/20 text-green",
                  ].join(" ")}
                >
                  {item.is_available ? "On" : "Off"}
                </span>
              </div>
              <div className="flex justify-end gap-2">
                <GhostButton href={`/admin/menu/${item.id}/edit`}>Edit</GhostButton>
                <form action={deleteItem}>
                  <input type="hidden" name="id" value={item.id} />
                  <DangerButton>Del</DangerButton>
                </form>
              </div>
            </div>
          ))}
          {(!data || data.length === 0) && (
            <div className="px-4 py-10 text-center text-[12px] text-green/60 font-semibold uppercase tracking-[0.18em]">
              No menu items yet
            </div>
          )}
        </div>
      </div>
    </>
  );
}
