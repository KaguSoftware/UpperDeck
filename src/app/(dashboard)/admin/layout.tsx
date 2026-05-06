import { requireRole } from "@/lib/auth/require-session";
import { AdminShell } from "./_sidebar";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const { profile } = await requireRole(["admin", "owner"]);

  const nav = [
    { href: "/admin", label: "Dashboard" },
    { href: "/admin/menu", label: "Menu" },
    { href: "/admin/categories", label: "Categories" },
    { href: "/admin/addons", label: "Add-Ons" },
    { href: "/admin/settings", label: "Settings" },
    { href: "/admin/qr", label: "Table QRs" },
    ...(profile.role === "owner"
      ? [{ href: "/admin/users", label: "Users", admin: true }]
      : []),
  ];

  return (
    <AdminShell nav={nav} displayName={profile.display_name} role={profile.role}>
      {children}
    </AdminShell>
  );
}
