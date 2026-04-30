"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireRole } from "@/lib/auth/require-session";

const HeroSchema = z.object({
  hero_mode: z.enum(["none", "media", "featured"]),
  hero_media_url: z.string().url().nullable().optional(),
  hero_media_type: z.enum(["image", "video"]).nullable().optional(),
  featured_item_id: z.string().uuid().nullable().optional(),
  featured_label: z.string().max(200).nullable().optional(),
  featured_badge: z.string().max(60).nullable().optional(),
});

export async function saveHeroSettings(formData: FormData) {
  const { supabase } = await requireRole(["admin", "owner"]);

  const raw = (k: string) => { const v = formData.get(k); return v && v !== "" ? v : null; };

  const parsed = HeroSchema.parse({
    hero_mode: raw("hero_mode") ?? "none",
    hero_media_url: raw("hero_media_url"),
    hero_media_type: raw("hero_media_type"),
    featured_item_id: raw("featured_item_id"),
    featured_label: raw("featured_label"),
    featured_badge: raw("featured_badge"),
  });

  const upserts = [
    { key: "hero_mode", value: parsed.hero_mode },
    { key: "hero_media_url", value: parsed.hero_media_url ?? "" },
    { key: "hero_media_type", value: parsed.hero_media_type ?? "" },
    { key: "featured_item_id", value: parsed.featured_item_id ?? "" },
    { key: "featured_label", value: parsed.featured_label ?? "" },
    { key: "featured_badge", value: parsed.featured_badge ?? "" },
  ];

  for (const row of upserts) {
    const { error } = await supabase
      .from("settings")
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .upsert(row as any, { onConflict: "key" });
    if (error) throw new Error(error.message);
  }

  revalidatePath("/admin/settings");
  revalidatePath("/en");
  revalidatePath("/tr");
}
