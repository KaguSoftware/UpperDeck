"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireRole } from "@/lib/auth/require-session";
import { getAdminClient } from "@/lib/supabase/admin";

const RoleSchema = z.enum(["admin", "owner"]);

export async function setRole(formData: FormData) {
  const { user: actor } = await requireRole("admin");

  const userId = z.string().uuid().parse(formData.get("user_id"));
  const role = RoleSchema.parse(formData.get("role"));

  if (userId === actor.id) {
    throw new Error("You cannot change your own role.");
  }

  const admin = getAdminClient();
  const { error } = await admin.from("profiles").update({ role }).eq("id", userId);
  if (error) throw new Error(error.message);

  revalidatePath("/admin/users");
}

const InviteSchema = z.object({
  email: z.string().email().trim().toLowerCase(),
  role: RoleSchema,
});

export async function inviteUser(formData: FormData) {
  await requireRole("admin");
  const { email, role } = InviteSchema.parse({
    email: formData.get("email"),
    role: formData.get("role"),
  });

  const admin = getAdminClient();
  const { data, error } = await admin.auth.admin.inviteUserByEmail(email, {
    data: { display_name: email.split("@")[0] },
  });
  if (error) throw new Error(error.message);

  if (data.user) {
    await admin.from("profiles").update({ role }).eq("id", data.user.id);
  }

  revalidatePath("/admin/users");
}
