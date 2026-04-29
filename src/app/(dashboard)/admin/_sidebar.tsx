"use client";

import Link from "next/link";
import Image from "next/image";
import { useState, useEffect } from "react";
import { usePathname } from "next/navigation";
import { SignOutButton } from "./_submit-buttons";
import { RealtimeProvider, useRealtimeConnection } from "./_realtime-context";

type NavItem = { href: string; label: string; admin?: boolean };

function RealtimePill() {
  const { connectionState } = useRealtimeConnection();
  const pathname = usePathname();
  const onOrdersPage = pathname === "/admin/orders" || pathname.startsWith("/admin/orders/");

  // If we've navigated away from orders, the context still holds the last known
  // state; show "Idle" instead so the pill isn't misleadingly green.
  const effectiveState = onOrdersPage ? connectionState : "idle";

  const config = {
    idle:         { dot: "bg-green/30", text: "text-green/40", label: "● Idle"         },
    connecting:   { dot: "bg-orange/60", text: "text-orange/70", label: "● Connecting…" },
    connected:    { dot: "bg-green",     text: "text-green",     label: "● Live"         },
    disconnected: { dot: "bg-[#e0a800]", text: "text-[#7a5100]", label: "● Offline"     },
  }[effectiveState];

  return (
    <div className="flex items-center gap-1.5 mb-3">
      <span className={`w-1.5 h-1.5 rounded-full inline-block shrink-0 ${config.dot}`} />
      <span className={`font-ui font-extrabold text-[9px] tracking-[0.2em] uppercase ${config.text}`}>
        {config.label.slice(2) /* strip the ● — already in the dot */}
      </span>
    </div>
  );
}

export function AdminShell({
  children,
  nav,
  displayName,
  role,
}: {
  children: React.ReactNode;
  nav: NavItem[];
  displayName: string | null;
  role: string;
}) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  // Close sidebar whenever route changes (mobile nav)
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  return (
    <RealtimeProvider>
      <div className="min-h-screen flex">
        {/* ── Mobile overlay ── */}
        {open && (
          <div
            className="fixed inset-0 bg-black/40 z-20 lg:hidden"
            onClick={() => setOpen(false)}
          />
        )}

        {/* ── Sidebar ── */}
        <aside
          className={[
            "fixed inset-y-0 left-0 z-30 w-60 shrink-0 border-r-2 border-green bg-bg-deep flex flex-col",
            "transition-transform duration-200",
            "lg:static lg:translate-x-0",
            open ? "translate-x-0" : "-translate-x-full",
          ].join(" ")}
        >
          <Link
            href="/admin"
            className="flex items-center gap-2.5 px-4 py-4 border-b-2 border-green"
          >
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
            {nav.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={[
                  "block px-4 py-2.5 font-ui font-extrabold text-[11px] tracking-[0.22em] uppercase text-green border-l-4",
                  pathname === item.href
                    ? "bg-bg border-orange"
                    : "border-transparent hover:bg-bg hover:border-orange",
                ].join(" ")}
              >
                {item.label}
              </Link>
            ))}
          </nav>

          <div className="border-t-2 border-green px-4 py-3">
            <RealtimePill />
            <div className="text-[9px] tracking-[0.22em] font-bold text-green/60 uppercase">
              Signed in
            </div>
            <div className="font-ui font-extrabold text-[12px] text-green truncate">
              {displayName ?? "—"}
            </div>
            <div className="text-[9px] tracking-[0.18em] font-extrabold text-orange uppercase mt-0.5">
              {role}
            </div>
            <form action="/logout" method="post" className="mt-3">
              <SignOutButton />
            </form>
          </div>
        </aside>

        {/* ── Main ── */}
        <div className="flex-1 min-w-0 flex flex-col">
          {/* Mobile top bar */}
          <header className="lg:hidden flex items-center gap-3 px-4 py-3 border-b-2 border-green bg-bg-deep sticky top-0 z-10">
            <button
              type="button"
              onClick={() => setOpen((v) => !v)}
              aria-label="Toggle menu"
              className="flex flex-col gap-1.5 p-1 cursor-pointer"
            >
              <span className="block w-5 h-0.5 bg-green" />
              <span className="block w-5 h-0.5 bg-green" />
              <span className="block w-5 h-0.5 bg-green" />
            </button>
            <div className="font-bowlby text-[15px] leading-none text-green tracking-[-0.5px] uppercase">
              UPPER<span className="text-orange">DECK</span>
            </div>
          </header>

          <main className="flex-1 px-4 py-6 sm:px-8 sm:py-8 overflow-x-hidden">
            {children}
          </main>
        </div>
      </div>
    </RealtimeProvider>
  );
}
