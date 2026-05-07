import { Suspense } from "react";
import { getServerClient } from "@/lib/supabase/server";
import { PageHeader } from "../../_components";
import { NewAddonGroupForm } from "./_form";

export const dynamic = "force-dynamic";

export default async function NewAddonPage() {
  const supabase = await getServerClient();
  const [{ data: cats }, { data: menuItems }] = await Promise.all([
    supabase.from("categories").select("id, name_en").order("name_en"),
    supabase.from("menu_items").select("id, name_en").order("name_en"),
  ]);

  return (
    <>
      <PageHeader title="New Add-On Group" />
      <Suspense>
        <NewAddonGroupForm categories={cats ?? []} items={menuItems ?? []} />
      </Suspense>
    </>
  );
}
