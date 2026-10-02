import { NextResponse, type NextRequest } from "next/server";
import { COUNTRY_COOKIE, CURRENCY_COOKIE, detectCountry, resolveCurrency } from "@/lib/currency-detect";

/**
 * First visit: remember a currency for this browser from the visitor's country, so every page
 * (and the header switcher) agrees from then on. The visitor can change it at any time. The
 * detected country is remembered too, only to prefill "Country" at checkout (the buyer confirms it).
 */
export function proxy(request: NextRequest) {
  const response = NextResponse.next();
  if (!request.cookies.has(COUNTRY_COOKIE)) {
    const country = detectCountry({
      country: request.headers.get("x-vercel-ip-country"),
      acceptLanguage: request.headers.get("accept-language"),
    });
    if (country) {
      response.cookies.set(COUNTRY_COOKIE, country, {
        path: "/",
        sameSite: "lax",
        maxAge: 60 * 60 * 24 * 365,
        secure: process.env.NODE_ENV === "production",
      });
    }
  }
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
