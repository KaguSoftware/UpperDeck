import { unstable_cache } from "next/cache";
import { getCacheClient } from "@/lib/supabase/server";
import { PageHeader, PrimaryButton } from "../_components";
import { HeroConstructor } from "./_hero-constructor";
import { saveHeroSettings } from "./actions";

const getSettingsPageData = unstable_cache(
  async () => {
    const supabase = getCacheClient();
    const [{ data: settingsData }, { data: menuItems }] = await Promise.all([
      supabase.from("settings").select("key, value").in("key", [
        "hero_mode",
        "hero_media_url",
        "featured_item_id",
        "featured_label",
        "featured_badge",
        "featured_discount",
        "open_hours_tr",
        "open_hours_en",
      ]),
      supabase
        .from("menu_items")
        .select("id, name_en, image_url, emoji")
        .eq("is_available", true)
        .order("name_en", { ascending: true }),
    ]);
    return { settingsData: settingsData ?? [], menuItems: menuItems ?? [] };
  },
  ["admin-settings-page"],
  { tags: ["hero", "menu"] }
);

export default async function SettingsPage() {
  const { settingsData, menuItems } = await getSettingsPageData();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const get = (key: string) => (settingsData as any[])?.find((r: any) => r.key === key)?.value ?? null;

  const heroMode = (get("hero_mode") || "none") as "none" | "media" | "featured";
  const heroUrl = get("hero_media_url") || null;
  const featuredItemId = get("featured_item_id") || null;
  const featuredLabel = get("featured_label") || null;
  const featuredBadge = get("featured_badge") || null;
  const rawDiscount = get("featured_discount");
  const featuredDiscount = rawDiscount ? parseInt(rawDiscount, 10) || null : null;
  const openHoursTr = get("open_hours_tr") || null;
  const openHoursEn = get("open_hours_en") || null;

  const items = menuItems.map((i) => ({
    id: i.id,
    name: i.name_en,
    image_url: i.image_url,
    emoji: i.emoji,
  }));

  return (
    <>
      <PageHeader title="Başlangıç Bölümü" subtitle="Görünüm ve marka" />

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
          items={items}
          defaultItemId={featuredItemId}
          defaultLabel={featuredLabel}
          defaultBadge={featuredBadge}
          defaultDiscount={featuredDiscount}
          defaultOpenHoursTr={openHoursTr}
          defaultOpenHoursEn={openHoursEn}
        />

        <div className="pt-2 border-t-2 border-green/20">
          <PrimaryButton>Kaydet</PrimaryButton>
        </div>
      </form>
    </>
  );
}
