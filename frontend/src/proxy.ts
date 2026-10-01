import { NextResponse, type NextRequest } from "next/server";
import { CURRENCY_COOKIE, resolveCurrency } from "@/lib/currency-detect";

/**
 * First visit: remember a currency for this browser from the visitor's country, so every page
 * (and the header switcher) agrees from then on. The visitor can change it at any time.
 */
export function proxy(request: NextRequest) {
  const response = NextResponse.next();
  if (!request.cookies.has(CURRENCY_COOKIE)) {
    const currency = resolveCurrency({
      country: request.headers.get("x-vercel-ip-country"),
      acceptLanguage: request.headers.get("accept-language"),
    });
    response.cookies.set(CURRENCY_COOKIE, currency, {
      path: "/",
      sameSite: "lax",
      maxAge: 60 * 60 * 24 * 365,
      secure: process.env.NODE_ENV === "production",
    });
  }
  return response;
}

export const config = {
  // Pages only: not the API proxy, Next internals, or static files.
  matcher: ["/((?!api|internal|_next/static|_next/image|favicon.ico|icon.svg|robots.txt|sitemap.xml|.*\\.[a-z0-9]+$).*)"],
};
