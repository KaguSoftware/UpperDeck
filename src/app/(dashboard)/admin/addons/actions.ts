"use server";

import { updateTag } from "next/cache";
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
  required: z.coerce.boolean(),
  sort_order: z.coerce.number().int().default(0),
  category_id: z.string().uuid().nullable().optional(),
});

const OptionSchema = z.object({
  label_en: z.string().min(1).max(60).trim(),
  label_tr: z.string().min(1).max(60).trim(),
  price: z.coerce.number().nonnegative().max(100000).default(0),
  sort_order: z.coerce.number().int().default(0),
  menu_item_id: z.string().uuid().nullable().optional(),
});

function parseGroup(formData: FormData) {
  const scope = formData.get("scope") as string;
  const rawCat = formData.get("category_id");
  const itemIds = formData.getAll("menu_item_ids[]").map(String).filter(Boolean);
  return {
    group: GroupSchema.parse({
      label_en: formData.get("label_en"),
      label_tr: formData.get("label_tr"),
      multi: formData.get("multi") === "on",
      required: formData.get("required") === "on",
      sort_order: formData.get("sort_order") ?? 0,
      category_id: scope === "category" && rawCat ? rawCat : null,
    }),
    itemIds: scope === "item" ? itemIds : [],
  };
}

function parseOption(formData: FormData) {
  const rawItemId = formData.get("menu_item_id");
  return OptionSchema.parse({
    label_en: formData.get("label_en"),
    label_tr: formData.get("label_tr"),
    price: formData.get("price") ?? 0,
    sort_order: formData.get("sort_order") ?? 0,
    menu_item_id: rawItemId && rawItemId !== "" ? rawItemId : null,
  });
}

export async function createGroup(formData: FormData) {
  const { supabase } = await requireRole(["admin", "owner"]);
  const { group, itemIds } = parseGroup(formData);
  const { data: created, error } = await db(supabase)
    .from("addon_groups")
    .insert(group)
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  const groupId = (created as { id: string }).id;
  if (itemIds.length > 0) {
    const { error: joinError } = await db(supabase)
      .from("addon_group_items")
      .insert(itemIds.map((menu_item_id) => ({ addon_group_id: groupId, menu_item_id })));
    if (joinError) throw new Error(joinError.message);
  }
  updateTag("menu");
  redirect(`/admin/addons/${groupId}/edit`);
}

export async function updateGroup(id: string, formData: FormData) {
  const { supabase } = await requireRole(["admin", "owner"]);
  const { group, itemIds } = parseGroup(formData);
  const { error } = await db(supabase).from("addon_groups").update(group).eq("id", id);
  if (error) throw new Error(error.message);
  // Replace item assignments: delete all then re-insert
  await db(supabase).from("addon_group_items").delete().eq("addon_group_id", id);
  if (itemIds.length > 0) {
    const { error: joinError } = await db(supabase)
      .from("addon_group_items")
      .insert(itemIds.map((menu_item_id) => ({ addon_group_id: id, menu_item_id })));
    if (joinError) throw new Error(joinError.message);
  }
  updateTag("menu");
}

export async function deleteGroup(formData: FormData) {
  const id = z.string().uuid().parse(formData.get("id"));
  const { supabase } = await requireRole(["admin", "owner"]);
  const { error } = await db(supabase).from("addon_groups").delete().eq("id", id);
  if (error) throw new Error(error.message);
  updateTag("menu");
  redirect("/admin/addons");
}

export async function createOption(groupId: string, formData: FormData) {
  const { supabase } = await requireRole(["admin", "owner"]);
  const data = parseOption(formData);
  const { error } = await db(supabase)
    .from("addon_options")
    .insert({ ...data, addon_group_id: groupId });
  if (error) throw new Error(error.message);
  updateTag("menu");
}

export async function updateOption(id: string, _groupId: string, formData: FormData) {
  const { supabase } = await requireRole(["admin", "owner"]);
  const data = parseOption(formData);
  const { error } = await db(supabase).from("addon_options").update(data).eq("id", id);
  if (error) throw new Error(error.message);
  updateTag("menu");
}

export async function reorderOption(formData: FormData) {
  const id = z.string().uuid().parse(formData.get("id"));
  const groupId = z.string().uuid().parse(formData.get("group_id"));
  const direction = z.enum(["up", "down"]).parse(formData.get("direction"));
  const { supabase } = await requireRole(["admin", "owner"]);

  const { data: opts } = await db(supabase)
    .from("addon_options")
    .select("id, sort_order")
    .eq("addon_group_id", groupId)
    .order("sort_order", { ascending: true });

  const list = (opts ?? []) as { id: string; sort_order: number }[];
  const idx = list.findIndex((o) => o.id === id);
  const swapIdx = direction === "up" ? idx - 1 : idx + 1;
  if (idx === -1 || swapIdx < 0 || swapIdx >= list.length) return;

  const a = list[idx];
  const b = list[swapIdx];
  await Promise.all([
    db(supabase).from("addon_options").update({ sort_order: b.sort_order }).eq("id", a.id),
    db(supabase).from("addon_options").update({ sort_order: a.sort_order }).eq("id", b.id),
  ]);

  updateTag("menu");
}

export async function deleteOption(formData: FormData) {
  const id = z.string().uuid().parse(formData.get("id"));
  const { supabase } = await requireRole(["admin", "owner"]);
  const { error } = await db(supabase).from("addon_options").delete().eq("id", id);
  if (error) throw new Error(error.message);
  updateTag("menu");
}
