"use server";

import { updateTag } from "next/cache";
import { broadcastMenuUpdate } from "@/lib/broadcast";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireRole } from "@/lib/auth/require-session";
import type { SupabaseClient } from "@supabase/supabase-js";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = (supabase: SupabaseClient) => supabase as any;

const GroupSchema = z.object({
  label_en: z.string().min(1).max(60).trim(),
  label_tr: z.string().min(1).max(60).trim(),
  sort_order: z.coerce.number().int().default(0),
  category_id: z.string().uuid().nullable().optional(),
  menu_item_id: z.string().uuid().nullable().optional(),
});

function parseGroup(formData: FormData) {
  const scope = formData.get("scope") as string;
  const rawCat = formData.get("category_id");
  const rawItem = formData.get("menu_item_id");
  return GroupSchema.parse({
    label_en: formData.get("label_en"),
    label_tr: formData.get("label_tr"),
    sort_order: formData.get("sort_order") ?? 0,
    category_id: scope === "category" && rawCat ? rawCat : null,
    menu_item_id: scope === "item" && rawItem ? rawItem : null,
  });
}

export async function createGroup(formData: FormData) {
  const { supabase } = await requireRole(["admin", "owner"]);
  const data = parseGroup(formData);
  const { data: group, error } = await db(supabase)
    .from("suggested_groups")
    .insert(data)
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  updateTag("menu");
  void broadcastMenuUpdate();
  redirect(`/admin/suggested/${(group as { id: string }).id}/edit`);
}

export async function updateGroup(id: string, formData: FormData) {
  const { supabase } = await requireRole(["admin", "owner"]);
  const data = parseGroup(formData);
  const { error } = await db(supabase).from("suggested_groups").update(data).eq("id", id);
  if (error) throw new Error(error.message);
  updateTag("menu");
  void broadcastMenuUpdate();
}

export async function deleteGroup(formData: FormData) {
  const id = z.string().uuid().parse(formData.get("id"));
  const { supabase } = await requireRole(["admin", "owner"]);
  const { error } = await db(supabase).from("suggested_groups").delete().eq("id", id);
  if (error) throw new Error(error.message);
  updateTag("menu");
  void broadcastMenuUpdate();
  redirect("/admin/suggested");
}

export async function createItem(groupId: string, formData: FormData) {
  const { supabase } = await requireRole(["admin", "owner"]);
  const menu_item_id = z.string().uuid().parse(formData.get("menu_item_id"));
  const sort_order = z.coerce.number().int().parse(formData.get("sort_order") ?? 0);
  const { error } = await db(supabase)
    .from("suggested_items")
    .insert({ suggested_group_id: groupId, menu_item_id, sort_order });
  if (error) throw new Error(error.message);
  updateTag("menu");
  void broadcastMenuUpdate();
}

export async function deleteItem(formData: FormData) {
  const id = z.string().uuid().parse(formData.get("id"));
  const { supabase } = await requireRole(["admin", "owner"]);
  const { error } = await db(supabase).from("suggested_items").delete().eq("id", id);
  if (error) throw new Error(error.message);
  updateTag("menu");
  void broadcastMenuUpdate();
}

export async function reorderItem(formData: FormData) {
  const id = z.string().uuid().parse(formData.get("id"));
  const groupId = z.string().uuid().parse(formData.get("group_id"));
  const direction = z.enum(["up", "down"]).parse(formData.get("direction"));
  const { supabase } = await requireRole(["admin", "owner"]);

  const { data: items } = await db(supabase)
    .from("suggested_items")
    .select("id, sort_order")
    .eq("suggested_group_id", groupId)
    .order("sort_order", { ascending: true });

  const list = (items ?? []) as { id: string; sort_order: number }[];
  const idx = list.findIndex((o) => o.id === id);
  const swapIdx = direction === "up" ? idx - 1 : idx + 1;
  if (idx === -1 || swapIdx < 0 || swapIdx >= list.length) return;

  const a = list[idx];
  const b = list[swapIdx];
  await Promise.all([
    db(supabase).from("suggested_items").update({ sort_order: b.sort_order }).eq("id", a.id),
    db(supabase).from("suggested_items").update({ sort_order: a.sort_order }).eq("id", b.id),
  ]);

  updateTag("menu");
  void broadcastMenuUpdate();
}
