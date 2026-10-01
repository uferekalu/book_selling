import type { Metadata } from "next";
import { SecuritySettings } from "@/features/account/security-settings";

export const metadata: Metadata = { title: "Security" };

export default function SecurityPage() {
  return <SecuritySettings />;
}
