"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireRole } from "@/lib/auth/require-session";

const ItemSchema = z.object({
  category_id: z.string().uuid(),
  name_en: z.string().min(1).max(80).trim(),
  name_tr: z.string().min(1).max(80).trim(),
  hook_en: z.string().max(80).trim().default(""),
  hook_tr: z.string().max(80).trim().default(""),
  desc_en: z.string().max(500).trim().default(""),
  desc_tr: z.string().max(500).trim().default(""),
  highlight: z.enum(["green-fill", "orange-fill", ""]).transform((v) => v === "" ? null : v).nullable().optional(),
  image_url: z.string().url().nullable().optional(),
  price: z.coerce.number().nonnegative().max(100000),
  spicy: z.coerce.boolean(),
  is_available: z.coerce.boolean(),
  sort_order: z.coerce.number().int().default(0),
});

function parse(formData: FormData) {
  const rawImageUrl = formData.get("image_url");
  return ItemSchema.parse({
    category_id: formData.get("category_id"),
    name_en: formData.get("name_en"),
    name_tr: formData.get("name_tr"),
    hook_en: formData.get("hook_en") ?? "",
    hook_tr: formData.get("hook_tr") ?? "",
    desc_en: formData.get("desc_en") ?? "",
    desc_tr: formData.get("desc_tr") ?? "",
    highlight: (formData.get("highlight") as string) || "",
    image_url: rawImageUrl && rawImageUrl !== "" ? rawImageUrl : null,
    price: formData.get("price"),
    spicy: formData.get("spicy") === "on",
    is_available: formData.get("is_available") === "on",
    sort_order: formData.get("sort_order") ?? 0,
  });
}

export async function createItem(formData: FormData) {
  const { user, supabase } = await requireRole(["admin", "owner"]);
  const data = parse(formData);
  const { error } = await supabase
    .from("menu_items")
    .insert({ ...data, created_by: user.id });
  if (error) throw new Error(error.message);
  revalidatePath("/admin/menu");
  revalidatePath("/admin");
  redirect("/admin/menu");
}

export async function updateItem(id: string, formData: FormData) {
  const { supabase } = await requireRole(["admin", "owner"]);
  const data = parse(formData);
  const { error } = await supabase.from("menu_items").update(data).eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/admin/menu");
  revalidatePath(`/admin/menu/${id}/edit`);
  redirect("/admin/menu");
}

export async function deleteItem(formData: FormData) {
  const id = z.string().uuid().parse(formData.get("id"));
  const { supabase } = await requireRole(["admin", "owner"]);
  const { error } = await supabase.from("menu_items").delete().eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/admin/menu");
  revalidatePath("/admin");
}
