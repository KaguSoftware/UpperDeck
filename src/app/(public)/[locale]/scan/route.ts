import { NextResponse } from "next/server";
import { verifyToken, signTableCookie } from "@/lib/table-auth";
import { isValidTableId } from "@/lib/tables";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ locale: string }> }
) {
  const { locale } = await params;
  const { searchParams } = new URL(request.url);

  const table = searchParams.get("t") ?? "";
  const rawW = searchParams.get("w") ?? "";
  const tok = searchParams.get("tok") ?? "";

  const menuUrl = new URL(`/${locale}`, request.url);

  if (!isValidTableId(table) || !verifyToken(table, rawW, tok)) {
    menuUrl.searchParams.set("scan_error", "1");
    return NextResponse.redirect(menuUrl, { status: 303 });
  }

  const res = NextResponse.redirect(menuUrl, { status: 303 });
  res.cookies.set("table_session", signTableCookie(table), {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 28800,
  });
  return res;
}
