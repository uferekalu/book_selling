import type { Metadata } from "next";
import { OrderAdminDetail } from "@/features/admin/order-admin-detail";

export const metadata: Metadata = { title: "Order" };

export default async function AdminOrderPage({ params }: PageProps<"/admin/orders/[orderNumber]">) {
  const { orderNumber } = await params;
  return <OrderAdminDetail orderNumber={orderNumber} />;
}
