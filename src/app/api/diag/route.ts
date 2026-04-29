import { NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

export const dynamic = "force-dynamic";

export async function GET() {
  const supaUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  const pubKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? "";

  // 1) Auth state via the same client the app uses
  const cookieStore = await cookies();
  const ssrClient = createServerClient(supaUrl, pubKey, {
    cookies: {
      getAll() { return cookieStore.getAll(); },
      setAll() { /* noop */ },
    },
  });
  const { data: u } = await ssrClient.auth.getUser();

  // 2) Same-as-app insert (uses cookies/session if present)
  const sampleItem = {
    menu_item_id: "b6d8b136-c0a1-40eb-ab25-079f446763bb",
    name_en: "Diag",
    name_tr: "Diag",
    price: 1,
    qty: 1,
  };
  const { error: ssrInsertErr, status: ssrInsertStatus } = await ssrClient
    .from("orders")
    .insert({ table_number: 1, items: [sampleItem], note: "diag-ssr", total: 1 });

  // 3) Pure anon insert — fresh client with no cookies/session at all
  const anonClient = createServerClient(supaUrl, pubKey, {
    cookies: { getAll: () => [], setAll: () => {} },
  });
  const { error: anonInsertErr, status: anonInsertStatus } = await anonClient
    .from("orders")
    .insert({ table_number: 1, items: [sampleItem], note: "diag-anon", total: 1 });

  return NextResponse.json({
    runtime: process.env.NEXT_RUNTIME ?? "node",
    region: process.env.VERCEL_REGION ?? null,
    deploymentEnv: process.env.VERCEL_ENV ?? "local",
    supaUrl,
    pubKeyPrefix: pubKey.slice(0, 18),
    pubKeyLen: pubKey.length,
    isLoggedIn: Boolean(u?.user),
    userId: u?.user?.id ?? null,
    userEmail: u?.user?.email ?? null,
    ssrInsert: { status: ssrInsertStatus, error: ssrInsertErr },
    anonInsert: { status: anonInsertStatus, error: anonInsertErr },
  });
}
