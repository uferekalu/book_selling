"use client";

import { ShieldAlert } from "lucide-react";
import NextLink from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { ButtonLink, Container, EmptyState, Eyebrow } from "@/components/ui";
import { RequireAuth } from "@/features/account/require-auth";
import { cn } from "@/lib/cn";
import { useAppSelector } from "@/lib/redux/hooks";

export const ADMIN_NAV = [
  { href: "/admin", label: "Dashboard" },
  { href: "/admin/orders", label: "Orders" },
  { href: "/admin/customers", label: "Customers" },
  { href: "/admin/reports", label: "Reports" },
  { href: "/admin/messages", label: "Messages" },
  { href: "/admin/emails", label: "Emails" },
  { href: "/admin/books", label: "Books" },
  { href: "/admin/reviews", label: "Reviews" },
  { href: "/admin/coupons", label: "Discount codes" },
  { href: "/admin/authors", label: "Authors" },
  { href: "/admin/categories", label: "Subjects" },
  { href: "/admin/shipping", label: "Shipping" },
  { href: "/admin/audit", label: "Audit log", ownerOnly: true },
] as const satisfies ReadonlyArray<{ href: string; label: string; ownerOnly?: boolean }>;

/**
 * Store management. The API refuses every admin call unless the account is staff AND signed in
 * with two-step verification; this shell just explains that instead of showing broken pages.
 */
export function AdminShell({ children }: { children: ReactNode }) {
  return (
    <RequireAuth>
      <StaffGate>
        <Container className="flex flex-col gap-6 py-6 sm:py-10">
          <div className="flex flex-col gap-4">
            <div>
              <Eyebrow>Store admin</Eyebrow>
              <h1 className="text-4xl font-medium">Store</h1>
            </div>
            <AdminNav />
          </div>
          {children}
        </Container>
      </StaffGate>
    </RequireAuth>
  );
}

function StaffGate({ children }: { children: ReactNode }) {
  const user = useAppSelector((state) => state.session.user);
  if (!user) return null;
  const isStaff = user.role === "admin" || user.role === "owner";
  if (!isStaff) {
    return (
      <Container className="py-16">
        <EmptyState
          icon={ShieldAlert}
          title="This area is for store staff"
          description="Your account doesn't have access to store management."
          action={<ButtonLink href="/">Back to the store</ButtonLink>}
        />
      </Container>
    );
  }
  if (!user.twoFactorEnabled) {
    return (
      <Container className="py-16">
        <EmptyState
          icon={ShieldAlert}
          title="Turn on two-step verification first"
          description="Staff accounts must use two-step verification before store management opens. It takes about a minute with an authenticator app."
          action={<ButtonLink href="/account/security">Set it up</ButtonLink>}
        />
      </Container>
    );
  }
  return <>{children}</>;
}

function AdminNav() {
  const pathname = usePathname();
  const isOwner = useAppSelector((state) => state.session.user?.role === "owner");
  return (
    <nav aria-label="Store admin">
      {/* Phones: one row that scrolls sideways. Wider screens: every page visible, wrapping. */}
      <ul className="scrollbar-none -mx-1 flex gap-2 overflow-x-auto px-1 sm:flex-wrap sm:overflow-visible">
        {ADMIN_NAV.filter((item) => isOwner || !("ownerOnly" in item)).map((item) => {
          // The dashboard is /admin itself; every other page also owns its sub-pages.
          const active = pathname === item.href || (item.href !== "/admin" && pathname.startsWith(`${item.href}/`));
          return (
            <li key={item.href} className="shrink-0">
              <NextLink
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex min-h-11 items-center rounded-full px-4 text-sm font-medium whitespace-nowrap transition-colors",
                  active ? "bg-primary text-on-primary" : "bg-secondary text-text hover:bg-secondary-hover",
                )}
              >
                {item.label}
              </NextLink>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
