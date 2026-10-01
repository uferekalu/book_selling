import type { Metadata } from "next";
import { OrdersAdmin } from "@/features/admin/orders-admin";

export const metadata: Metadata = { title: "Orders" };

export default function AdminOrdersPage() {
  return <OrdersAdmin />;
}
