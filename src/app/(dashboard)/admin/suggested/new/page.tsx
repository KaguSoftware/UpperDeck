import { Suspense } from "react";
import { getServerClient } from "@/lib/supabase/server";
import { PageHeader } from "../../_components";
import { NewSuggestedGroupForm } from "./_form";


export default async function NewSuggestedPage() {
  const supabase = await getServerClient();
  const [{ data: cats }, { data: menuItems }, { count: groupCount }] = await Promise.all([
    supabase.from("categories").select("id, name_en").order("name_en"),
    supabase.from("menu_items").select("id, name_en").order("name_en"),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (supabase as any).from("suggested_groups").select("id", { count: "exact", head: true }),
  ]);

  return (
    <>
      <PageHeader title="Yeni Öneri Grubu" />
      <Suspense>
        <NewSuggestedGroupForm
          categories={cats ?? []}
          items={menuItems ?? []}
          defaultSortOrder={groupCount ?? 0}
        />
      </Suspense>
    </>
  );
}
