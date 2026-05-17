"use client";

import { useFormStatus } from "react-dom";
import { Loader } from "@/components/Loader/components";

export function LoginSubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="bg-orange text-white border-0 px-4 py-3 font-ui font-extrabold text-[11px] tracking-[0.22em] uppercase cursor-pointer mt-2 disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-2"
    >
      {pending && <Loader size="xs" tone="onDark" />}
      Sign in
    </button>
  );
}
