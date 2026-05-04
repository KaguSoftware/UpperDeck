"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { getBrowserClient } from "@/lib/supabase/client";

function SetPasswordForm() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const supabase = getBrowserClient();

  const [verifying, setVerifying] = useState(true);
  const [verifyError, setVerifyError] = useState<string | null>(null);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  useEffect(() => {
    const tokenHash = searchParams.get("token_hash");
    const type = searchParams.get("type");

    if (!tokenHash || type !== "invite") {
      setVerifyError("Invalid or missing invite link. Please request a new invitation.");
      setVerifying(false);
      return;
    }

    supabase.auth
      .verifyOtp({ token_hash: tokenHash, type: "invite" })
      .then(({ error }) => {
        if (error) setVerifyError(error.message);
        setVerifying(false);
      });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitError(null);

    if (password.length < 8) {
      setSubmitError("Password must be at least 8 characters.");
      return;
    }
    if (password !== confirm) {
      setSubmitError("Passwords do not match.");
      return;
    }

    setSubmitting(true);
    const { error } = await supabase.auth.updateUser({ password });
    if (error) {
      setSubmitError(error.message);
      setSubmitting(false);
      return;
    }

    router.replace("/admin");
  }

  return (
    <main className="min-h-screen grid place-items-center px-6 py-10">
      <div className="w-full max-w-sm">
        <Link href="/" className="block mb-8">
          <div className="font-bowlby text-[42px] leading-[0.85] text-green tracking-[-1px] uppercase">
            UPPER<span className="text-orange">DECK</span>
          </div>
          <div className="text-[10px] tracking-[0.32em] font-bold text-green opacity-80 uppercase mt-1">
            Admin
          </div>
        </Link>

        <div className="border-2 border-green bg-white p-6 flex flex-col gap-4">
          <div className="font-bowlby text-[22px] uppercase text-green leading-none">
            Set your password
          </div>

          {verifying && (
            <div className="flex items-center gap-2 text-green text-[12px] font-bold uppercase tracking-[0.12em]">
              <span className="w-3 h-3 border-2 border-green border-t-transparent rounded-full animate-spin inline-block" />
              Verifying invite…
            </div>
          )}

          {verifyError && (
            <div className="bg-orange text-white text-[11px] font-extrabold uppercase tracking-[0.12em] px-3 py-2">
              {verifyError}
            </div>
          )}

          {!verifying && !verifyError && (
            <form onSubmit={handleSubmit} className="flex flex-col gap-4">
              {submitError && (
                <div className="bg-orange text-white text-[11px] font-extrabold uppercase tracking-[0.12em] px-3 py-2">
                  {submitError}
                </div>
              )}

              <label className="flex flex-col gap-1.5">
                <span className="text-[10px] font-extrabold uppercase tracking-[0.18em] text-green">
                  New password
                </span>
                <input
                  type="password"
                  required
                  minLength={8}
                  autoComplete="new-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="border-2 border-green bg-bg px-3 py-2.5 font-ui text-[14px] text-ink focus:outline-none focus:bg-white"
                />
              </label>

              <label className="flex flex-col gap-1.5">
                <span className="text-[10px] font-extrabold uppercase tracking-[0.18em] text-green">
                  Confirm password
                </span>
                <input
                  type="password"
                  required
                  minLength={8}
                  autoComplete="new-password"
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  className="border-2 border-green bg-bg px-3 py-2.5 font-ui text-[14px] text-ink focus:outline-none focus:bg-white"
                />
              </label>

              <button
                type="submit"
                disabled={submitting}
                className="bg-orange text-white px-4 py-3 font-ui font-extrabold text-[11px] tracking-[0.22em] uppercase cursor-pointer mt-2 disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {submitting && (
                  <span className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin inline-block" />
                )}
                Set password &amp; sign in
              </button>
            </form>
          )}
        </div>
      </div>
    </main>
  );
}

export default function SetPasswordPage() {
  return (
    <Suspense fallback={null}>
      <SetPasswordForm />
    </Suspense>
  );
}
