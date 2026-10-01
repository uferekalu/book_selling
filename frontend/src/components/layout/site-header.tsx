"use client";

import { Menu } from "lucide-react";
import NextLink from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { Container, Divider, Drawer, Icon, IconButton, ThemeToggle } from "@/components/ui";
import { cn } from "@/lib/cn";
import { useAppSelector } from "@/lib/redux/hooks";
import { ACCOUNT_NAV } from "@/lib/site";
import { AccountLinks, AccountMenu } from "./account-menu";
import { Logo } from "./logo";

/**
 * Sticky frosted header. From `md` up: logo, theme and account menu inline. Below `md`: logo and
 * a menu button that opens a left drawer with the same controls as inline elements (no
 * portal-based menus inside a drawer: see frontend/CLAUDE.md).
 */
export function SiteHeader() {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const signedIn = useAppSelector((state) => state.session.status === "authenticated");

  return (
    <header className="surface-glass sticky top-0 z-(--z-header) border-b border-border pt-[env(safe-area-inset-top)]">
      <Container className="flex h-(--header-height) items-center justify-between gap-3">
        <Logo />
        <div className="hidden items-center gap-3 md:flex">
          <ThemeToggle />
          <AccountMenu />
        </div>
        <IconButton
          className="md:hidden"
          label="Open menu"
          aria-expanded={open}
          onClick={() => setOpen(true)}
          icon={<Icon icon={Menu} />}
        />
      </Container>

      <Drawer open={open} onClose={() => setOpen(false)} side="left" title="Menu" hideTitle>
        <nav aria-label="Main" className="flex flex-col gap-6">
          <Logo />
          {signedIn && (
            <ul className="flex flex-col">
              {ACCOUNT_NAV.map((item) => (
                <li key={item.href}>
                  <NextLink
                    href={item.href}
                    onClick={() => setOpen(false)}
                    aria-current={pathname === item.href ? "page" : undefined}
                    className={cn(
                      "flex min-h-12 items-center rounded-lg px-3 text-base font-medium transition-colors",
                      pathname === item.href ? "bg-primary-subtle text-on-primary-subtle" : "text-text hover:bg-secondary",
                    )}
                  >
                    {item.label}
                  </NextLink>
                </li>
              ))}
            </ul>
          )}
          <Divider />
          <AccountLinks onNavigate={() => setOpen(false)} />
          <div className="flex flex-col gap-2">
            <p className="text-sm font-medium text-text-muted">Theme</p>
            <ThemeToggle showLabels className="self-start" />
          </div>
        </nav>
      </Drawer>
    </header>
  );
}
