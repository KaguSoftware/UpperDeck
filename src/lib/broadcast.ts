import "server-only";
import { createClient } from "@supabase/supabase-js";
import { env } from "@/lib/env";

export async function broadcastMenuUpdate() {
  try {
    const supabase = createClient(
      env.NEXT_PUBLIC_SUPABASE_URL,
      env.SUPABASE_SERVICE_ROLE_KEY ?? env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
      { auth: { persistSession: false, autoRefreshToken: false } }
    );
    await supabase.channel("menu-updates").send({
      type: "broadcast",
      event: "refresh",
      payload: {},
    });
  } catch {
    // non-critical — don't break the action if broadcast fails
  }
}
