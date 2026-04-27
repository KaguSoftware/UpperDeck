"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireRole } from "@/lib/auth/require-session";

const CategorySchema = z.object({
  slug: z
    .string()
    .min(1)
    .max(60)
    .regex(/^[a-z0-9-]+$/, "lowercase letters, numbers and dashes only")
    .trim(),
  name_en: z.string().min(1).max(60).trim(),
  name_tr: z.string().min(1).max(60).trim(),
  sort_order: z.coerce.number().int().default(0),
});

function parse(formData: FormData) {
  return CategorySchema.parse({
    slug: formData.get("slug"),
    name_en: formData.get("name_en"),
    name_tr: formData.get("name_tr"),
    sort_order: formData.get("sort_order") ?? 0,
  });
}

export async function createCategory(formData: FormData) {
  const { user, supabase } = await requireRole(["admin", "owner"]);
  const data = parse(formData);
  const { error } = await supabase
    .from("categories")
    .insert({ ...data, created_by: user.id });
  if (error) throw new Error(error.message);
  revalidatePath("/admin/categories");
  revalidatePath("/admin");
  redirect("/admin/categories");
}

export async function updateCategory(id: string, formData: FormData) {
  const { supabase } = await requireRole(["admin", "owner"]);
  const data = parse(formData);
  const { error } = await supabase.from("categories").update(data).eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/admin/categories");
  redirect("/admin/categories");
}

export async function deleteCategory(formData: FormData) {
  const id = z.string().uuid().parse(formData.get("id"));
  const { supabase } = await requireRole(["admin", "owner"]);
  const { error } = await supabase.from("categories").delete().eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/admin/categories");
  revalidatePath("/admin");
}
