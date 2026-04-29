"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireRole } from "@/lib/auth/require-session";
import type { Order } from "@/types/database";

const UpdateSchema = z.object({
  id: z.string().uuid(),
  status: z.enum(["new", "seen", "preparing", "served", "cancelled"]),
});

export async function updateOrderStatus(formData: FormData) {
  const { supabase } = await requireRole(["admin", "owner"]);
  const { id, status } = UpdateSchema.parse({
    id: formData.get("id"),
    status: formData.get("status"),
  });
  const { error } = await supabase.from("orders").update({ status }).eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/admin/orders");
}

export async function getRecentOrders(): Promise<Order[]> {
  const { supabase } = await requireRole(["admin", "owner"]);
  const { data, error } = await supabase
    .from("orders")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(50);
  if (error) throw new Error(error.message);
  return (data ?? []) as Order[];
}
