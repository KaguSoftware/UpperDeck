"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireRole } from "@/lib/auth/require-session";
import type { SupabaseClient } from "@supabase/supabase-js";

// addon_groups and addon_options are not in the generated Database type yet
// (types regenerate after migration is applied). Cast to bypass until then.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = (supabase: SupabaseClient) => supabase as any;

const GroupSchema = z.object({
  label_en: z.string().min(1).max(60).trim(),
  label_tr: z.string().min(1).max(60).trim(),
  multi: z.coerce.boolean(),
  sort_order: z.coerce.number().int().default(0),
  category_id: z.string().uuid().nullable().optional(),
  menu_item_id: z.string().uuid().nullable().optional(),
});

const OptionSchema = z.object({
  label_en: z.string().min(1).max(60).trim(),
  label_tr: z.string().min(1).max(60).trim(),
  price: z.coerce.number().nonnegative().max(100000).default(0),
  sort_order: z.coerce.number().int().default(0),
});

function parseGroup(formData: FormData) {
  const scope = formData.get("scope") as string;
  const rawCat = formData.get("category_id");
  const rawItem = formData.get("menu_item_id");
  return GroupSchema.parse({
    label_en: formData.get("label_en"),
    label_tr: formData.get("label_tr"),
    multi: formData.get("multi") === "on",
    sort_order: formData.get("sort_order") ?? 0,
    category_id: scope === "category" && rawCat ? rawCat : null,
    menu_item_id: scope === "item" && rawItem ? rawItem : null,
  });
}

function parseOption(formData: FormData) {
  return OptionSchema.parse({
    label_en: formData.get("label_en"),
    label_tr: formData.get("label_tr"),
    price: formData.get("price") ?? 0,
    sort_order: formData.get("sort_order") ?? 0,
  });
}

export async function createGroup(formData: FormData) {
  const { user, supabase } = await requireRole(["admin", "owner"]);
  const data = parseGroup(formData);
  const { data: group, error } = await db(supabase)
    .from("addon_groups")
    .insert({ ...data, created_by: user.id })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  revalidatePath("/admin/addons");
  redirect(`/admin/addons/${(group as { id: string }).id}/edit`);
}

export async function updateGroup(id: string, formData: FormData) {
  const { supabase } = await requireRole(["admin", "owner"]);
  const data = parseGroup(formData);
  const { error } = await db(supabase).from("addon_groups").update(data).eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/admin/addons");
  revalidatePath(`/admin/addons/${id}/edit`);
}

export async function deleteGroup(formData: FormData) {
  const id = z.string().uuid().parse(formData.get("id"));
  const { supabase } = await requireRole(["admin", "owner"]);
  const { error } = await db(supabase).from("addon_groups").delete().eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/admin/addons");
  redirect("/admin/addons");
}

export async function createOption(groupId: string, formData: FormData) {
  const { supabase } = await requireRole(["admin", "owner"]);
  const data = parseOption(formData);
  const { error } = await db(supabase)
    .from("addon_options")
    .insert({ ...data, addon_group_id: groupId });
  if (error) throw new Error(error.message);
  revalidatePath("/admin/addons");
  revalidatePath(`/admin/addons/${groupId}/edit`);
}

export async function updateOption(id: string, groupId: string, formData: FormData) {
  const { supabase } = await requireRole(["admin", "owner"]);
  const data = parseOption(formData);
  const { error } = await db(supabase).from("addon_options").update(data).eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/admin/addons");
  revalidatePath(`/admin/addons/${groupId}/edit`);
}

export async function deleteOption(formData: FormData) {
  const id = z.string().uuid().parse(formData.get("id"));
  const groupId = z.string().uuid().parse(formData.get("group_id"));
  const { supabase } = await requireRole(["admin", "owner"]);
  const { error } = await db(supabase).from("addon_options").delete().eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/admin/addons");
  revalidatePath(`/admin/addons/${groupId}/edit`);
}
