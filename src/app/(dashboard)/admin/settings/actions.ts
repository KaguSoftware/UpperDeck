"use server";

import { updateTag } from "next/cache";
import { broadcastMenuUpdate } from "@/lib/broadcast";
import { z } from "zod";
import { requireRole } from "@/lib/auth/require-session";
import { notifyOk } from "@/lib/admin/notify";

const HeroSchema = z.object({
  hero_mode: z.enum(["none", "media", "featured"]),
  hero_media_url: z.string().url().nullable().optional(),
  featured_item_id: z.string().uuid().nullable().optional(),
  featured_label: z.string().max(200).nullable().optional(),
  featured_badge: z.string().max(60).nullable().optional(),
  featured_discount: z.coerce.number().int().min(0).max(99).nullable().optional(),
  open_hours_tr: z.string().max(80).nullable().optional(),
  open_hours_en: z.string().max(80).nullable().optional(),
});

export async function saveHeroSettings(formData: FormData) {
  const { supabase } = await requireRole(["admin", "owner"]);

  const raw = (k: string) => { const v = formData.get(k); return v && v !== "" ? v : null; };

  const parsed = HeroSchema.parse({
    hero_mode: raw("hero_mode") ?? "none",
    hero_media_url: raw("hero_media_url"),
    featured_item_id: raw("featured_item_id"),
    featured_label: raw("featured_label"),
    featured_badge: raw("featured_badge"),
    featured_discount: raw("featured_discount"),
    open_hours_tr: raw("open_hours_tr"),
    open_hours_en: raw("open_hours_en"),
  });

  const rows = [
    { key: "hero_mode", value: parsed.hero_mode },
    { key: "hero_media_url", value: parsed.hero_media_url ?? "" },
    { key: "featured_item_id", value: parsed.featured_item_id ?? "" },
    { key: "featured_label", value: parsed.featured_label ?? "" },
    { key: "featured_badge", value: parsed.featured_badge ?? "" },
    { key: "featured_discount", value: parsed.featured_discount != null ? String(parsed.featured_discount) : "" },
    { key: "open_hours_tr", value: parsed.open_hours_tr ?? "" },
    { key: "open_hours_en", value: parsed.open_hours_en ?? "" },
  ];

  // The `settings` table is not in the generated Database type yet, so the
  // upsert payload needs a cast. Validation above guarantees shape.
  const { error } = await supabase
    .from("settings")
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .upsert(rows as any, { onConflict: "key" });
  if (error) throw new Error(error.message);

  updateTag("hero");
  void broadcastMenuUpdate();
  notifyOk("/admin/settings", "Ayarlar kaydedildi");
}
