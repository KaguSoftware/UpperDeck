import "server-only";
import { redirect } from "next/navigation";
import { getServerClient } from "@/lib/supabase/server";
import type { Role } from "@/types/database";

export async function requireSession(callbackUrl = "/admin") {
  const supabase = await getServerClient();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) {
    redirect(`/login?next=${encodeURIComponent(callbackUrl)}`);
  }
  return { user: data.user, supabase };
}

export async function requireRole(
  allowed: Role | Role[],
  callbackUrl = "/admin"
) {
  const { user, supabase } = await requireSession(callbackUrl);
  const { data: profile } = await supabase
    .from("profiles")
    .select("id, role, display_name")
    .eq("id", user.id)
    .single();

  if (!profile) redirect("/login?error=no_profile");

  const allowedList = Array.isArray(allowed) ? allowed : [allowed];
  if (!allowedList.includes(profile.role)) {
    redirect("/admin?error=forbidden");
  }
  return { user, profile, supabase };
}
