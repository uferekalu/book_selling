import type { Metadata } from "next";
import { Logo } from "@/components/layout/logo";
import { BookCover } from "@/components/ui";
import { BRAND_NAME } from "@/lib/site";

export const metadata: Metadata = {
  // Account pages have nothing to index, and their links may carry one-time tokens.
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

/**
 * Split screen from `lg`: a brand panel beside a focused form column. On phones the form is the
 * whole page, starting right under the logo with nothing to scroll past.
 */
export default function AuthLayout({ children }: LayoutProps<"/">) {
  return (
    <div className="grid min-h-dvh lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
      <aside
        aria-hidden="true"
        className="surface-grain relative hidden overflow-hidden bg-linear-to-br from-brown-800 via-brown-900 to-brown-950 lg:flex lg:flex-col lg:justify-between lg:p-12 xl:p-16"
      >
        <p className="font-display text-xl text-paper-50">{BRAND_NAME}</p>
        <div className="relative flex items-end justify-center gap-6 py-10">
          <div className="absolute inset-x-12 bottom-6 h-24 rounded-full bg-gold-500/25 blur-3xl" />
          <BookCover title="Principles of Foundry Technology" author="Prof. A. Author" size="lg" interactive={false} className="-rotate-6" />
          <BookCover title="Heat Treatment of Steels" author="Prof. A. Author" size="md" interactive={false} className="translate-y-8 rotate-3" />
        </div>
        <blockquote className="max-w-md">
          <p className="font-display text-3xl leading-snug text-paper-50">
            Read the introduction of any book free. Buy only when you know it&rsquo;s the right one.
          </p>
          <footer className="mt-4 text-sm tracking-wide text-gold-200 uppercase">Print and instant ebooks, worldwide</footer>
        </blockquote>
      </aside>

      <main id="main" className="safe-x flex flex-col bg-background pt-[env(safe-area-inset-top)]">
        <div className="flex h-(--header-height) items-center">
          <Logo />
        </div>
        <div className="flex flex-1 items-start justify-center py-8 sm:items-center sm:py-12">
          <div className="w-full max-w-md animate-rise-in">{children}</div>
        </div>
      </main>
    </div>
  );
}
