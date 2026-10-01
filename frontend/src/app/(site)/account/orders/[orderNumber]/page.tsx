import type { Metadata } from "next";
import { AccountOrder } from "@/features/orders/orders-list";

export const metadata: Metadata = { title: "Order" };

export default async function OrderPage({ params }: PageProps<"/account/orders/[orderNumber]">) {
  const { orderNumber } = await params;
  return <AccountOrder orderNumber={orderNumber} />;
}
