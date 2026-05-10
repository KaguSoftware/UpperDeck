import { Suspense } from "react";
import { getServerClient } from "@/lib/supabase/server";
import { PageHeader } from "../../_components";
import { NewAddonGroupForm } from "./_form";


export default async function NewAddonPage() {
  const supabase = await getServerClient();
  const [{ data: cats }, { data: menuItems }, { count: groupCount }] = await Promise.all([
    supabase.from("categories").select("id, name_en").order("name_en"),
    supabase.from("menu_items").select("id, name_en").order("name_en"),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (supabase as any).from("addon_groups").select("id", { count: "exact", head: true }),
  ]);

  return (
    <>
      <PageHeader title="Yeni Ekstra Grubu" />
      <Suspense>
        <NewAddonGroupForm categories={cats ?? []} items={menuItems ?? []} defaultSortOrder={groupCount ?? 0} />
      </Suspense>
    </>
  );
}
