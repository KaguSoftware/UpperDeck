import "server-only";
import { unstable_cache } from "next/cache";
import { getCacheClient } from "@/lib/supabase/server";

export const getWaiterDisabledTables = unstable_cache(
  async (): Promise<string[]> => {
    const supabase = getCacheClient();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data } = await (supabase as any)
      .from("settings")
      .select("value")
      .eq("key", "waiter_disabled_tables")
      .maybeSingle();
    if (!data?.value) return [];
    // Tolerate legacy number[] payloads from before string IDs were introduced.
    const parsed = JSON.parse(data.value) as unknown[];
    return parsed.map((v) => String(v));
  },
  ["waiter_disabled_tables"],
  { tags: ["settings"] }
);
