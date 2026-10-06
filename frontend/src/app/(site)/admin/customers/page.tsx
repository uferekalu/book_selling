import type { Metadata } from "next";
import { CustomersAdmin } from "@/features/admin/customers-admin";

export const metadata: Metadata = { title: "Customers" };

export default function AdminCustomersPage() {
  return <CustomersAdmin />;
}
