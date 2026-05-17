"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ADMIN_TOAST_EVENT, type AdminToastDetail } from "@/lib/admin/notify";

type ToastState = { kind: "ok" | "err"; label: string } | null;

const DISMISS_MS = 3000;

export function AdminToast() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [toast, setToast] = useState<ToastState>(null);

  // Read URL params on every navigation
  useEffect(() => {
    const ok = searchParams.get("ok");
    const err = searchParams.get("err");
    const label = searchParams.get("label");
    if ((ok || err) && label) {
      setToast({ kind: ok ? "ok" : "err", label });
      // Strip the query string so a refresh doesn't replay the toast
      const params = new URLSearchParams(searchParams.toString());
      params.delete("ok");
      params.delete("err");
      params.delete("label");
      const qs = params.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname);
    }
  }, [searchParams, pathname, router]);

  // Listen for client-side dispatches
  useEffect(() => {
    function handler(e: Event) {
      const detail = (e as CustomEvent<AdminToastDetail>).detail;
      if (!detail) return;
      setToast(detail);
    }
    window.addEventListener(ADMIN_TOAST_EVENT, handler);
    return () => window.removeEventListener(ADMIN_TOAST_EVENT, handler);
  }, []);

  // Auto-dismiss
  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => setToast(null), DISMISS_MS);
    return () => clearTimeout(id);
  }, [toast]);

  if (!toast) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className={[
        "fixed top-4 right-4 z-100000 px-4 py-2.5 font-ui font-extrabold text-[11px] tracking-[0.22em] uppercase shadow-lg max-w-sm",
        toast.kind === "ok" ? "bg-green text-bg" : "bg-orange text-white",
      ].join(" ")}
    >
      {toast.label}
    </div>
  );
}
