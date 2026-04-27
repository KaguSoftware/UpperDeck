"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { getServerClient } from "@/lib/supabase/server";

const Credentials = z.object({
  email: z.string().email().trim().toLowerCase(),
  password: z.string().min(8),
  next: z.string().optional(),
});

export async function signIn(formData: FormData) {
  const parsed = Credentials.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
    next: formData.get("next") ?? undefined,
  });

  if (!parsed.success) {
    redirect(`/login?error=${encodeURIComponent("Enter a valid email and 8+ char password.")}`);
  }

  const supabase = await getServerClient();
  const { error } = await supabase.auth.signInWithPassword({
    email: parsed.data.email,
    password: parsed.data.password,
  });

  if (error) {
    redirect(`/login?error=${encodeURIComponent(error.message)}`);
  }

  redirect(parsed.data.next && parsed.data.next.startsWith("/") ? parsed.data.next : "/admin");
}
