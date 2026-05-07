"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireRole } from "@/lib/auth/require-session";
import { getAdminClient } from "@/lib/supabase/admin";

const RoleSchema = z.enum(["admin", "owner"]);

export async function setRole(formData: FormData) {
  const { user: actor } = await requireRole("owner");

  const userId = z.string().uuid().parse(formData.get("user_id"));
  const role = RoleSchema.parse(formData.get("role"));

  if (userId === actor.id) {
    throw new Error("You cannot change your own role.");
  }

  const admin = getAdminClient();

  if (role !== "owner") {
    const [{ data: target }, { count }] = await Promise.all([
      admin.from("profiles").select("role").eq("id", userId).single(),
      admin
        .from("profiles")
        .select("id", { count: "exact", head: true })
        .eq("role", "owner"),
    ]);
    if (target?.role === "owner" && (count ?? 0) <= 1) {
      throw new Error("Cannot remove the last owner.");
    }
  }

  const { error } = await admin.from("profiles").update({ role }).eq("id", userId);
  if (error) throw new Error(error.message);

  revalidatePath("/admin/users");
  redirect("/admin/users");
}

export async function removeUser(formData: FormData) {
  const { user: actor } = await requireRole("owner");

  const userId = z.string().uuid().parse(formData.get("user_id"));

  if (userId === actor.id) {
    throw new Error("You cannot remove yourself.");
  }

  const admin = getAdminClient();

  const [{ data: target }, { count }] = await Promise.all([
    admin.from("profiles").select("role").eq("id", userId).single(),
    admin.from("profiles").select("id", { count: "exact", head: true }).eq("role", "owner"),
  ]);

  if (target?.role === "owner" && (count ?? 0) <= 1) {
    throw new Error("Cannot remove the last owner.");
  }

  const { error } = await admin.auth.admin.deleteUser(userId);
  if (error) throw new Error(error.message);

  revalidatePath("/admin/users");
  redirect("/admin/users");
}

const InviteSchema = z.object({
  email: z.string().email().trim().toLowerCase(),
  role: RoleSchema,
});

export async function inviteUser(
  _prev: { error: string | null; success: boolean },
  formData: FormData
): Promise<{ error: string | null; success: boolean }> {
  try {
    await requireRole("owner");
    const { email, role } = InviteSchema.parse({
      email: formData.get("email"),
      role: formData.get("role"),
    });

    const admin = getAdminClient();
    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
    const { data, error } = await admin.auth.admin.inviteUserByEmail(email, {
      data: { display_name: email.split("@")[0] },
      redirectTo: `${siteUrl}/auth/set-password`,
    });
    if (error) return { error: error.message, success: false };

    if (data.user) {
      await admin.from("profiles").update({ role }).eq("id", data.user.id);
    }

    revalidatePath("/admin/users");
    return { error: null, success: true };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Unknown error", success: false };
  }
}
