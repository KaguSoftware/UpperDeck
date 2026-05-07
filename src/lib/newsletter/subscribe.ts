"use server";

import { getServerClient } from "@/lib/supabase/server";

export async function subscribeNewsletter(email: string): Promise<{ ok: boolean; alreadySubscribed?: boolean }> {
  const trimmed = email.trim().toLowerCase();
  if (!trimmed || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
    return { ok: false };
  }

  const supabase = await getServerClient();
  const { error } = await supabase.from("newsletter").insert({ email: trimmed });

  if (error) {
    if (error.code === "23505") return { ok: true, alreadySubscribed: true };
    console.error("[subscribeNewsletter]", error.message);
    return { ok: false };
  }

  return { ok: true };
}
