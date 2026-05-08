"use server";

import { updateTag } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireRole } from "@/lib/auth/require-session";
import { getServerClient } from "@/lib/supabase/server";

const CategorySchema = z.object({
  slug: z
    .string()
    .min(1)
    .max(60)
    .regex(/^[a-z0-9-]+$/, "lowercase letters, numbers and dashes only")
    .trim(),
  name_en: z.string().min(1).max(60).trim(),
  name_tr: z.string().min(1).max(60).trim(),
  image_url: z.string().url().nullable().optional(),
  emoji: z.string().max(10).nullable().optional(),
  parent_id: z.string().uuid().nullable().optional(),
});

function parse(formData: FormData) {
  const rawImageUrl = formData.get("image_url");
  const rawEmoji = formData.get("emoji");
  const rawParentId = formData.get("parent_id");
  return CategorySchema.parse({
    slug: formData.get("slug"),
    name_en: formData.get("name_en"),
    name_tr: formData.get("name_tr"),
    image_url: rawImageUrl && rawImageUrl !== "" ? rawImageUrl : null,
    emoji: rawEmoji && rawEmoji !== "" ? rawEmoji : null,
    parent_id: rawParentId && rawParentId !== "" ? rawParentId : null,
  });
}

export async function createCategory(formData: FormData) {
  const { user, supabase } = await requireRole(["admin", "owner"]);
  const data = parse(formData);

  const { data: maxRow } = await supabase
    .from("categories")
    .select("sort_order")
    .is("parent_id", null)
    .order("sort_order", { ascending: false })
    .limit(1)
    .single();

  const sort_order = (maxRow?.sort_order ?? 0) + 1;

  const { error } = await supabase
    .from("categories")
    .insert({ ...data, sort_order, created_by: user.id });
  if (error) throw new Error(error.message);
  updateTag("menu");

  redirect("/admin/categories");
}

export async function updateCategory(id: string, formData: FormData) {
  const { supabase } = await requireRole(["admin", "owner"]);
  const data = parse(formData);
  const { error } = await supabase.from("categories").update(data).eq("id", id);
  if (error) throw new Error(error.message);
  updateTag("menu");
  redirect("/admin/categories");
}

export async function deleteCategory(formData: FormData) {
  const id = z.string().uuid().parse(formData.get("id"));
  const { supabase } = await requireRole(["admin", "owner"]);
  const { error } = await supabase.from("categories").delete().eq("id", id);
  if (error) throw new Error(error.message);
  updateTag("menu");

}

async function reorderCategory(id: string, direction: "up" | "down") {
  const supabase = await getServerClient();

  // Fetch the current row including its parent_id so we scope neighbours correctly
  const { data: curr, error: e1 } = await supabase
    .from("categories")
    .select("id, sort_order, parent_id")
    .eq("id", id)
    .single();
  if (e1 || !curr) throw new Error(e1?.message ?? "Not found");

  // Build neighbour query scoped to the same level (same parent_id or both top-level)
  let neighbourQ = supabase
    .from("categories")
    .select("id, sort_order")
    .limit(1);

  neighbourQ = curr.parent_id
    ? neighbourQ.eq("parent_id", curr.parent_id)
    : neighbourQ.is("parent_id", null);

  const { data: neighbours, error: e2 } =
    direction === "up"
      ? await neighbourQ.lt("sort_order", curr.sort_order).order("sort_order", { ascending: false })
      : await neighbourQ.gt("sort_order", curr.sort_order).order("sort_order", { ascending: true });

  if (e2) throw new Error(e2.message);
  const neighbour = neighbours?.[0];
  if (!neighbour) return;

  // Swap just the two sort_order values
  await Promise.all([
    supabase.from("categories").update({ sort_order: neighbour.sort_order }).eq("id", curr.id),
    supabase.from("categories").update({ sort_order: curr.sort_order }).eq("id", neighbour.id),
  ]);

  updateTag("menu");
}

export async function moveCategoryUp(id: string) {
  await reorderCategory(z.string().uuid().parse(id), "up");
}

export async function moveCategoryDown(id: string) {
  await reorderCategory(z.string().uuid().parse(id), "down");
}
