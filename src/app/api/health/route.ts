import { NextResponse } from "next/server";
import { getServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function GET() {
  const headers = { "Cache-Control": "no-store" };
  try {
    const supabase = await getServerClient();
    const { error } = await supabase
      .from("categories")
      .select("id")
      .limit(1)
      .maybeSingle();

    if (error) {
      return NextResponse.json(
        { ok: false, error: error.message },
        { status: 503, headers }
      );
    }

    return NextResponse.json(
      { ok: true, ts: new Date().toISOString(), db: "ok" },
      { status: 200, headers }
    );
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "unknown" },
      { status: 503, headers }
    );
  }
}
