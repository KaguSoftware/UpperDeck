import { requireRole } from "@/lib/auth/require-session";
import { getServerClient } from "@/lib/supabase/server";
import { PageHeader } from "../_components";
import { OrdersClient } from "./_client";
import type { Order } from "@/types/database";

export const dynamic = "force-dynamic";

export default async function OrdersPage() {
  await requireRole(["admin", "owner"]);
  const supabase = await getServerClient();

  const { data, error } = await supabase
    .from("orders")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(50);

  if (error) throw new Error(error.message);

  const orders = (data ?? []) as Order[];

  return (
    <>
      <PageHeader title="Orders" subtitle={`${orders.length} loaded`} />
      <OrdersClient initialOrders={orders} />
    </>
  );
}
