import "server-only";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { env } from "@/lib/env";
import type { Database } from "@/types/database";

/**
 * Cookie-free read-only client for use inside unstable_cache().
 * Uses the anon key without session cookies — safe for shared/public data.
 */
export function getCacheClient() {
  return createClient<Database>(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    { auth: { persistSession: false, autoRefreshToken: false } }
  );
}

export async function getServerClient() {
  const cookieStore = await cookies();

  return createServerClient<Database>(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          // In Server Components Next.js disallows cookie writes; the proxy
          // handles session refresh, so swallowing here is intentional.
          try {
            for (const { name, value, options } of cookiesToSet) {
              cookieStore.set(name, value, options);
            }
          } catch {
            // no-op when called from a pure Server Component render
          }
        },
      },
    }
  );
}
