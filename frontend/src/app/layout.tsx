import type { Metadata, Viewport } from "next";
import { Fraunces, Inter, JetBrains_Mono } from "next/font/google";
import { SessionBootstrap } from "@/components/session-bootstrap";
import { ThemeSync } from "@/components/theme-sync";
import { ToastProvider } from "@/components/ui";
import { StoreProvider } from "@/lib/redux/store-provider";
import { THEME_BOOTSTRAP_SCRIPT } from "@/lib/theme";
import "./globals.css";

// Self-hosted by next/font at build time: no request to Google from the visitor's browser,
// and no layout shift while fonts load.
const fraunces = Fraunces({
  subsets: ["latin"],
  variable: "--font-fraunces",
  axes: ["opsz", "SOFT"],
  display: "swap",
});
const inter = Inter({ subsets: ["latin"], variable: "--font-inter", display: "swap" });
const jetbrains = JetBrains_Mono({ subsets: ["latin"], variable: "--font-jetbrains", display: "swap" });

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: "Engineering Books",
    template: "%s · Engineering Books",
  },
  description:
    "Mechanical engineering textbooks and ebooks. Read the introduction free, then buy print or instant-download editions from anywhere in the world.",
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  // Content extends under notches and home indicators; `.safe-*` utilities pad it back in.
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#fdfbf8" },
    { media: "(prefers-color-scheme: dark)", color: "#120d09" },
  ],
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${fraunces.variable} ${inter.variable} ${jetbrains.variable} antialiased`}
      // The bootstrap script sets data-theme before hydration, on purpose.
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOTSTRAP_SCRIPT }} />
      </head>
      <body className="flex min-h-dvh flex-col">
        <a
          href="#main"
          className="sr-only fixed top-3 left-3 z-(--z-tooltip) rounded-lg bg-primary px-4 py-3 text-sm font-semibold text-on-primary focus:not-sr-only"
        >
          Skip to content
        </a>
        <StoreProvider>
          <ThemeSync />
          <SessionBootstrap />
          <ToastProvider>{children}</ToastProvider>
        </StoreProvider>
      </body>
    </html>
  );
}
