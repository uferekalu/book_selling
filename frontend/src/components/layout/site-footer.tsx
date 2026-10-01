import NextLink from "next/link";
import { Container } from "@/components/ui";
import { BRAND_NAME } from "@/lib/site";

const LEGAL_LINKS = [
  { href: "/legal/terms", label: "Terms of Sale" },
  { href: "/legal/privacy", label: "Privacy Policy" },
];

export function SiteFooter() {
  return (
    <footer className="surface-grain mt-auto border-t border-border bg-surface-sunken">
      <Container className="flex flex-col gap-4 py-8 pb-[max(2rem,env(safe-area-inset-bottom))] text-sm text-text-muted sm:flex-row sm:items-center sm:justify-between">
        <p>
          © {new Date().getFullYear()} {BRAND_NAME}. Secure payments by Paystack, Flutterwave and Stripe.
        </p>
        <nav aria-label="Legal">
          <ul className="flex flex-wrap gap-x-5 gap-y-2">
            {LEGAL_LINKS.map((link) => (
              <li key={link.href}>
                <NextLink href={link.href} className="inline-flex min-h-11 items-center hover:text-text sm:min-h-0">
                  {link.label}
                </NextLink>
              </li>
            ))}
          </ul>
        </nav>
      </Container>
    </footer>
  );
}
