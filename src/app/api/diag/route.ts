import { NextResponse, type NextRequest } from "next/server";
import { getServerClient } from "@/lib/supabase/server";
import { submitOrder } from "@/lib/orders/submit";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const supabase = await getServerClient();

  // Pick a real menu item
  const { data: items } = await supabase
    .from("menu_items")
    .select("id, name_en, price")
    .gt("price", 0)
    .limit(1);
  const m = items?.[0];
  if (!m) return NextResponse.json({ error: "no items" });

  const payload = {
    table_number: 1,
    items: [
      { menu_item_id: m.id, name_en: m.name_en, name_tr: m.name_en, price: m.price, qty: 1 },
    ],
    note: "diag-three-paths",
    total: m.price,
  };

  // Path A: raw insert via the server client (cookies-aware)
  const { error: rawErr } = await supabase
    .from("orders")
    .insert({ table_number: payload.table_number, items: payload.items, note: payload.note, total: payload.total });

  // Path B: direct submitOrder call (route-handler context, no action POST)
  const directResult = await submitOrder(payload);

  // Path C: invoke the actual server-action POST, forwarding cookies
  const cookieHeader = req.headers.get("cookie") ?? "";
  const origin = req.nextUrl.origin;

  // Find action ID — try prod manifest first, fall back to dev
  const fs = await import("node:fs/promises");
  const path = await import("node:path");
  const candidates = [
    ".next/server/app/(public)/[locale]/page/server-reference-manifest.json",
    ".next/dev/server/app/(public)/[locale]/page/server-reference-manifest.json",
  ];
  let actionId: string | null = null;
  for (const c of candidates) {
    const raw = await fs.readFile(path.resolve(/* turbopackIgnore: true */ c), "utf8").catch(() => "");
    if (!raw) continue;
    try {
      const json = JSON.parse(raw) as { node?: Record<string, { exportedName: string }> };
      for (const [id, e] of Object.entries(json.node ?? {})) {
        if (e.exportedName === "submitOrder") { actionId = id; break; }
      }
    } catch { /* */ }
    if (actionId) break;
  }

  let actionStatus: number | null = null;
  let actionBody: string | null = null;
  if (actionId) {
    const r = await fetch(`${origin}/en`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "text/x-component",
        "Next-Action": actionId,
        Cookie: cookieHeader,
      },
      body: JSON.stringify([payload]),
    });
    actionStatus = r.status;
    actionBody = await r.text();
  }

  return NextResponse.json({
    rawInsertError: rawErr,
    directSubmitOrder: directResult,
    actionId,
    actionStatus,
    actionBody,
  });
}
