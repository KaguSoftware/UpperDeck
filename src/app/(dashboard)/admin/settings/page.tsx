import { getServerClient } from "@/lib/supabase/server";
import { PageHeader, PrimaryButton } from "../_components";
import { HeroConstructor } from "./_hero-constructor";
import { saveHeroSettings } from "./actions";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const supabase = await getServerClient();
  const [{ data: settingsData }, { data: menuItems }] = await Promise.all([
    supabase.from("settings").select("key, value").in("key", [
      "hero_mode",
      "hero_media_url",
      "hero_media_type",
      "featured_item_id",
      "featured_label",
      "featured_badge",
      "featured_discount",
    ]),
    supabase
      .from("menu_items")
      .select("id, name_en, image_url, emoji")
      .eq("is_available", true)
      .order("name_en", { ascending: true }),
  ]);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const get = (key: string) => (settingsData as any[])?.find((r: any) => r.key === key)?.value ?? null;

  const heroMode = (get("hero_mode") || "none") as "none" | "media" | "featured";
  const heroUrl = get("hero_media_url") || null;
  const heroType = (get("hero_media_type") || null) as "image" | "video" | null;
  const featuredItemId = get("featured_item_id") || null;
  const featuredLabel = get("featured_label") || null;
  const featuredBadge = get("featured_badge") || null;
  const rawDiscount = get("featured_discount");
  const featuredDiscount = rawDiscount ? parseInt(rawDiscount, 10) || null : null;

  const items = (menuItems ?? []).map((i) => ({
    id: i.id,
    name: i.name_en,
    image_url: i.image_url,
    emoji: i.emoji,
  }));

  return (
    <>
      <PageHeader title="Settings" subtitle="Appearance &amp; branding" />

      <form
        action={saveHeroSettings}
        className="border-2 border-green bg-white p-6 flex flex-col gap-5 max-w-2xl"
      >
        <h2 className="font-bowlby text-[18px] uppercase text-green leading-none tracking-[-0.3px]">
          Hero
        </h2>

        <HeroConstructor
          defaultMode={heroMode}
          defaultMediaUrl={heroUrl}
          defaultMediaType={heroType}
          items={items}
          defaultItemId={featuredItemId}
          defaultLabel={featuredLabel}
          defaultBadge={featuredBadge}
          defaultDiscount={featuredDiscount}
        />

        <div className="pt-2 border-t-2 border-green/20">
          <PrimaryButton>Save</PrimaryButton>
        </div>
      </form>
    </>
  );
}
