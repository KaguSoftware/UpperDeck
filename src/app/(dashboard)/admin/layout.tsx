import Link from "next/link";
import Image from "next/image";
import { requireRole } from "@/lib/auth/require-session";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const { profile } = await requireRole(["admin", "owner"]);

  const nav: { href: string; label: string; admin?: boolean }[] = [
    { href: "/admin", label: "Dashboard" },
    { href: "/admin/menu", label: "Menu" },
    { href: "/admin/categories", label: "Categories" },
    { href: "/admin/users", label: "Users", admin: true },
  ];

  return (
    <div className="min-h-screen flex">
      <aside className="w-60 shrink-0 border-r-2 border-green bg-bg-deep flex flex-col">
        <Link href="/admin" className="flex items-center gap-2.5 px-4 py-4 border-b-2 border-green">
          <div className="w-11 h-11 bg-white rounded-full grid place-items-center overflow-hidden shrink-0">
            <Image src="/upperdeck-logo.png" alt="" width={44} height={44} priority />
          </div>
          <div>
            <div className="font-bowlby text-[15px] leading-[0.9] text-green tracking-[-0.5px] uppercase">
              UPPER<span className="text-orange">DECK</span>
            </div>
            <div className="text-[8px] tracking-[0.28em] font-bold text-green/80 uppercase mt-0.5">
              Admin
            </div>
          </div>
        </Link>

        <nav className="flex-1 py-3">
          {nav
            .filter((item) => !item.admin || profile.role === "admin")
            .map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="block px-4 py-2.5 font-ui font-extrabold text-[11px] tracking-[0.22em] uppercase text-green hover:bg-bg border-l-4 border-transparent hover:border-orange"
              >
                {item.label}
              </Link>
            ))}
        </nav>

        <div className="border-t-2 border-green px-4 py-3">
          <div className="text-[9px] tracking-[0.22em] font-bold text-green/60 uppercase">
            Signed in
          </div>
          <div className="font-ui font-extrabold text-[12px] text-green truncate">
            {profile.display_name ?? "—"}
          </div>
          <div className="text-[9px] tracking-[0.18em] font-extrabold text-orange uppercase mt-0.5">
            {profile.role}
          </div>
          <form action="/logout" method="post" className="mt-3">
            <button
              type="submit"
              className="w-full bg-green-dark text-bg border-0 px-3 py-2 font-ui font-extrabold text-[10px] tracking-[0.2em] uppercase cursor-pointer"
            >
              Sign out
            </button>
          </form>
        </div>
      </aside>

      <main className="flex-1 min-w-0 px-8 py-8 overflow-x-hidden">{children}</main>
    </div>
  );
}
