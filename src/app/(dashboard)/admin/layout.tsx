import { Suspense } from "react";
import { requireRole } from "@/lib/auth/require-session";
import { AdminShell } from "./_sidebar";
import { AdminToast } from "./_toast";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const { profile } = await requireRole(["admin", "owner"]);

  const nav = [
    { href: "/admin", label: "Ana Panel" },
    { href: "/admin/menu", label: "Menü" },
    { href: "/admin/categories", label: "Kategoriler" },
    { href: "/admin/addons", label: "Ekstra / Seçenek" },
    { href: "/admin/suggested", label: "Önerilen" },
    { href: "/admin/settings", label: "Başlangıç Bölümü" },
    { href: "/admin/qr", label: "Masa QR'ları" },
    ...(profile.role === "owner"
      ? [{ href: "/admin/users", label: "Kullanıcılar", admin: true }]
      : []),
  ];

  return (
    <AdminShell nav={nav} displayName={profile.display_name} role={profile.role}>
      {children}
      <Suspense fallback={null}>
        <AdminToast />
      </Suspense>
    </AdminShell>
  );
}
