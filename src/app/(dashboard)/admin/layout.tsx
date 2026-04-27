import { requireRole } from "@/lib/auth/require-session";
import { AdminShell } from "./_sidebar";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const { profile } = await requireRole(["admin", "owner"]);

  const nav = [
    { href: "/admin", label: "Dashboard" },
    { href: "/admin/menu", label: "Menu" },
    { href: "/admin/categories", label: "Categories" },
    ...(profile.role === "admin"
      ? [{ href: "/admin/users", label: "Users", admin: true }]
      : []),
  ];

  return (
    <AdminShell nav={nav} displayName={profile.display_name} role={profile.role}>
      {children}
    </AdminShell>
  );
}
