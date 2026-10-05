import type { Metadata } from "next";
import { EmailsAdmin } from "@/features/admin/emails-admin";

export const metadata: Metadata = { title: "Emails" };

export default function AdminEmailsPage() {
  return <EmailsAdmin />;
}
