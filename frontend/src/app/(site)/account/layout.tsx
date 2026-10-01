import type { Metadata } from "next";
import { AccountShell } from "@/features/account/account-shell";

export const metadata: Metadata = {
  title: { default: "Your account", template: "%s · Your account" },
  robots: { index: false, follow: false },
};

export default function AccountLayout({ children }: LayoutProps<"/account">) {
  return <AccountShell>{children}</AccountShell>;
}
