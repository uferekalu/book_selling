"use client";

import { Menu } from "lucide-react";
import NextLink from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { Container, Divider, Drawer, Icon, IconButton, ThemeToggle } from "@/components/ui";
import { cn } from "@/lib/cn";
import { useAppSelector } from "@/lib/redux/hooks";
import { ACCOUNT_NAV, MAIN_NAV } from "@/lib/site";
import { CartButton, CartDrawer } from "@/features/cart/cart-drawer";
import { NotificationBell } from "@/features/notifications/notification-bell";
import { AccountLinks, AccountMenu } from "./account-menu";
import { CurrencySwitcher } from "./currency-switcher";
import { Logo } from "./logo";

function isActive(pathname: string, href: string) {
  return href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);
}

/**
 * Sticky frosted header. From `lg` up: logo, main links, currency, theme, cart and account inline.
 * Below `lg`: logo, the cart and a menu button opening a left drawer with the same controls as inline
 * elements (no portal-based menus inside a drawer: see frontend/CLAUDE.md).
 */
export function SiteHeader() {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const { status, user } = useAppSelector((state) => state.session);
  const signedIn = status === "authenticated";
  const isStaff = user?.role === "admin" || user?.role === "owner";

  const drawerLink = (href: string, label: string) => (
    <li key={href}>
      <NextLink
        href={href}
        onClick={() => setOpen(false)}
        aria-current={isActive(pathname, href) ? "page" : undefined}
        className={cn(
          "flex min-h-12 items-center rounded-lg px-3 text-base font-medium transition-colors",
          isActive(pathname, href) ? "bg-primary-subtle text-on-primary-subtle" : "text-text hover:bg-secondary",
        )}
      >
        {label}
      </NextLink>
    </li>
  );

  return (
    <header className="surface-glass sticky top-0 z-(--z-header) border-b border-border pt-[env(safe-area-inset-top)]">
      <Container className="flex h-(--header-height) items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-8">
          <Logo />
          <nav aria-label="Main" className="hidden lg:block">
            <ul className="flex items-center gap-1">
              {MAIN_NAV.map((item) => (
                <li key={item.href}>
                  <NextLink
                    href={item.href}
                    aria-current={isActive(pathname, item.href) ? "page" : undefined}
                    className={cn(
                      "inline-flex min-h-11 items-center rounded-full px-4 text-sm font-medium transition-colors",
                      isActive(pathname, item.href) ? "bg-primary-subtle text-on-primary-subtle" : "text-text-muted hover:bg-secondary hover:text-text",
                    )}
                  >
                    {item.label}
                  </NextLink>
                </li>
              ))}
            </ul>
          </nav>
        </div>
        <div className="flex items-center gap-1 lg:gap-3">
          <div className="hidden items-center gap-3 lg:flex">
            <CurrencySwitcher />
            <ThemeToggle />
          </div>
          <NotificationBell />
          <CartButton />
          <div className="hidden lg:block">
            <AccountMenu />
          </div>
          <IconButton
            className="lg:hidden"
            label="Open menu"
            aria-expanded={open}
            onClick={() => setOpen(true)}
            icon={<Icon icon={Menu} />}
          />
        </div>
      </Container>
      <CartDrawer />

      <Drawer open={open} onClose={() => setOpen(false)} side="left" title="Menu" hideTitle>
        <nav aria-label="Main" className="flex flex-col gap-6">
          <Logo />
          <ul className="flex flex-col">{MAIN_NAV.map((item) => drawerLink(item.href, item.label))}</ul>
          {signedIn && (
            <>
              <Divider />
              <ul className="flex flex-col">
                {ACCOUNT_NAV.map((item) => drawerLink(item.href, item.label))}
                {isStaff && drawerLink("/admin", "Store admin")}
              </ul>
            </>
          )}
          <Divider />
          <AccountLinks onNavigate={() => setOpen(false)} />
          <div className="grid gap-5 sm:grid-cols-2">
            <div className="flex flex-col gap-2">
              <label htmlFor="drawer-currency" className="text-sm font-medium text-text-muted">
                Currency
              </label>
              <CurrencySwitcher id="drawer-currency" className="w-full" />
            </div>
            <div className="flex flex-col gap-2">
              <p className="text-sm font-medium text-text-muted">Theme</p>
              <ThemeToggle showLabels className="self-start" />
            </div>
          </div>
        </nav>
      </Drawer>
    </header>
  );
}
