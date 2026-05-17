"use client";

import { useFormStatus } from "react-dom";
import { Loader } from "@/components/Loader/components";

export function SignOutButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="w-full bg-green-dark text-bg border-0 px-3 py-2 font-ui font-extrabold text-[10px] tracking-[0.2em] uppercase cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-2"
    >
      {pending && <Loader size="xs" tone="onDark" />}
      Çıkış Yap
    </button>
  );
}

export function SetRoleButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="bg-green text-bg px-3 py-1.5 text-[10px] font-extrabold uppercase tracking-[0.18em] cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed flex items-center gap-1.5"
    >
      {pending && <Loader size="xs" tone="onDark" />}
      Ayarla
    </button>
  );
}
