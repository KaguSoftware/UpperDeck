import { NextResponse, type NextRequest } from "next/server";
import { getServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const supabase = await getServerClient();
  const { data: items } = await supabase
    .from("menu_items")
    .select("id, name_en, price")
    .gt("price", 0)
    .limit(1);
  const m = items?.[0];
  if (!m) return NextResponse.json({ error: "no menu items" });

  // Forward the caller's cookies so the action runs with the same session
  const cookieHeader = req.headers.get("cookie") ?? "";

  // Find the action ID for submitOrder from the dev manifest
  const fs = await import("node:fs/promises");
  const manifestPath = ".next/dev/server/app/(public)/[locale]/page/server-reference-manifest.json";
  const raw = await fs.readFile(manifestPath, "utf8").catch(() => "");
  let actionId: string | null = null;
  try {
    const json = JSON.parse(raw) as { node: Record<string, { exportedName: string }> };
    for (const [id, entry] of Object.entries(json.node ?? {})) {
      if (entry.exportedName === "submitOrder") { actionId = id; break; }
    }
  } catch { /* ignore */ }

  if (!actionId) return NextResponse.json({ error: "could not find action id", manifestSize: raw.length });

  const body = JSON.stringify([
    {
      table_number: 1,
      items: [
        { menu_item_id: m.id, name_en: m.name_en, name_tr: m.name_en, price: m.price, qty: 1 },
      ],
      note: "diag-via-action",
      total: m.price,
    },
  ]);

  const r = await fetch("http://localhost:3000/en", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "text/x-component",
      "Next-Action": actionId,
      Cookie: cookieHeader,
    },
    body,
  });
  const text = await r.text();

  return NextResponse.json({ status: r.status, actionId, response: text });
}
