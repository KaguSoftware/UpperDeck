import { NextResponse, type NextRequest } from "next/server";
import { locales, defaultLocale } from "@/i18n/config";
import { refreshSession } from "@/lib/supabase/proxy";

const SKIP_LOCALE_PREFIXES = ["/admin", "/login", "/logout", "/auth", "/api"];
const ADMIN_PATHS = ["/admin"];

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  const { response, user } = await refreshSession(request);

  if (ADMIN_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`))) {
    if (!user) {
      const url = request.nextUrl.clone();
      url.pathname = "/login";
      url.searchParams.set("next", pathname);
      return NextResponse.redirect(url);
    }
    return response;
  }

  if (SKIP_LOCALE_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`))) {
    return response;
  }

  const pathnameHasLocale = locales.some(
    (l) => pathname.startsWith(`/${l}/`) || pathname === `/${l}`
  );
  if (pathnameHasLocale) return response;

  const locale = detectLocale(request);
  const url = request.nextUrl.clone();
  url.pathname = `/${locale}${pathname}`;
  return NextResponse.redirect(url);
}

function detectLocale(request: NextRequest): string {
  const acceptLanguage = request.headers.get("accept-language") ?? "";
  for (const part of acceptLanguage.split(",")) {
    const tag = part.trim().split(";")[0].toLowerCase();
    const matched = locales.find((l) => l === tag || tag.startsWith(`${l}-`));
    if (matched) return matched;
  }
  return defaultLocale;
}

export const config = {
  matcher: ["/((?!_next|.*\\..*).*)"],
};
