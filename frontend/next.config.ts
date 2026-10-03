import type { NextConfig } from "next";
import { getBackendUrl } from "./src/lib/backend-url";

const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  // Live updates connect straight to the API (Vercel rewrites can't carry WebSockets); the token,
  // not a cookie, authenticates them (docs/ARCHITECTURE.md §12).
  env: { NEXT_PUBLIC_REALTIME_URL: getBackendUrl() },
  images: {
    // Book covers and author photos come from Cloudinary, which resizes and picks AVIF/WebP itself
    // (src/lib/cloudinary-loader.ts), so no Next image optimisation server is needed.
    loader: "custom",
    loaderFile: "./src/lib/cloudinary-loader.ts",
  },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
  // Every browser API call goes through the storefront's own origin so the refresh-token cookie
  // is first-party — Safari and private windows drop third-party cookies, which logged people
  // out on reload in the reference project (docs/ARCHITECTURE.md §7).
  async rewrites() {
    return [{ source: "/api/:path*", destination: `${getBackendUrl()}/:path*` }];
  },
};

export default nextConfig;
