import Link from "next/link";
import { signIn } from "./actions";
import { LoginSubmitButton } from "./submit-button";

export const metadata = { title: "Sign in · Upperdeck" };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; next?: string }>;
}) {
  const { error, next } = await searchParams;

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

        <form action={signIn} className="border-2 border-green bg-white p-6 flex flex-col gap-4">
          <div className="font-bowlby text-[22px] uppercase text-green leading-none">Sign in</div>

          {error && (
            <div className="bg-orange text-white text-[11px] font-extrabold uppercase tracking-[0.12em] px-3 py-2">
              {error}
            </div>
          )}

          <input type="hidden" name="next" value={next ?? "/admin"} />

          <label className="flex flex-col gap-1.5">
            <span className="text-[10px] font-extrabold uppercase tracking-[0.18em] text-green">Email</span>
            <input
              name="email"
              type="email"
              required
              autoComplete="email"
              className="border-2 border-green bg-bg px-3 py-2.5 font-ui text-[14px] text-ink focus:outline-none focus:bg-white"
            />
          </label>

          <label className="flex flex-col gap-1.5">
            <span className="text-[10px] font-extrabold uppercase tracking-[0.18em] text-green">Password</span>
            <input
              name="password"
              type="password"
              required
              minLength={8}
              autoComplete="current-password"
              className="border-2 border-green bg-bg px-3 py-2.5 font-ui text-[14px] text-ink focus:outline-none focus:bg-white"
            />
          </label>

          <LoginSubmitButton />
        </form>

        <p className="text-[10px] text-green/70 mt-4 leading-relaxed">
          Owners and admins only. Accounts are provisioned in Supabase &gt; Authentication.
        </p>
      </div>
    </main>
  );
}
