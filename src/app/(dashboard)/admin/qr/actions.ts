"use server";

import { updateTag } from "next/cache";
import { requireRole } from "@/lib/auth/require-session";

export async function setTableWaiterDisabled(tableNumber: number, disabled: boolean) {
  const { supabase } = await requireRole(["admin", "owner"]);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const s = supabase as any;
  const { data } = await s
    .from("settings")
    .select("value")
    .eq("key", "waiter_disabled_tables")
    .maybeSingle();

  const current: number[] = data?.value ? (JSON.parse(data.value) as number[]) : [];
  const updated = disabled
    ? [...new Set([...current, tableNumber])]
    : current.filter((n) => n !== tableNumber);

  await s
    .from("settings")
    .upsert({ key: "waiter_disabled_tables", value: JSON.stringify(updated) });

  updateTag("settings");
}
