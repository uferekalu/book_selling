import type { Metadata } from "next";
import { AuditAdmin } from "@/features/admin/audit-admin";

export const metadata: Metadata = { title: "Audit log" };

export default function AdminAuditPage() {
  return <AuditAdmin />;
}
