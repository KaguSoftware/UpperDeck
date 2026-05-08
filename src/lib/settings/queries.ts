import "server-only";
import { unstable_cache } from "next/cache";
import { getCacheClient } from "@/lib/supabase/server";

export const getWaiterDisabledTables = unstable_cache(
  async (): Promise<number[]> => {
    const supabase = getCacheClient();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data } = await (supabase as any)
      .from("settings")
      .select("value")
      .eq("key", "waiter_disabled_tables")
      .maybeSingle();
    return data?.value ? (JSON.parse(data.value) as number[]) : [];
  },
  ["waiter_disabled_tables"],
  { tags: ["settings"] }
);
