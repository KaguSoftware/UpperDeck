import Link from "next/link";
import { getServerClient } from "@/lib/supabase/server";
import { PageHeader } from "./_components";

export const dynamic = "force-dynamic";

export default async function AdminDashboard({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  const supabase = await getServerClient();

  const [items, available, categories] = await Promise.all([
    supabase.from("menu_items").select("id", { count: "exact", head: true }),
    supabase.from("menu_items").select("id", { count: "exact", head: true }).eq("is_available", true),
    supabase.from("categories").select("id", { count: "exact", head: true }),
  ]);

  const stats = [
    { label: "Menu Items", value: items.count ?? 0, href: "/admin/menu" },
    { label: "Available", value: available.count ?? 0, href: "/admin/menu" },
    { label: "Categories", value: categories.count ?? 0, href: "/admin/categories" },
  ];

  return (
    <>
      <PageHeader title="Dashboard" subtitle="Upperdeck American Diner" />

      {error === "forbidden" && (
        <div className="bg-orange text-white text-[11px] font-extrabold uppercase tracking-[0.12em] px-3 py-2 mb-6">
          You don&apos;t have access to that page.
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 max-w-3xl">
        {stats.map((s) => (
          <Link
            key={s.label}
            href={s.href}
            className="block border-2 border-green bg-white p-5 hover:bg-bg-deep transition-colors"
          >
            <div className="text-[10px] tracking-[0.22em] font-bold text-green/70 uppercase">
              {s.label}
            </div>
            <div className="font-bowlby text-[48px] leading-none text-green mt-1">{s.value}</div>
          </Link>
        ))}
      </div>
    </>
  );
}
