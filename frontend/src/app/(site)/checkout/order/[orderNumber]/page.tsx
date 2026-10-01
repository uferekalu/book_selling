import type { Metadata } from "next";
import { GuestOrder } from "@/features/orders/guest-order";

export const metadata: Metadata = { title: "Your order", robots: { index: false, follow: false } };

export default async function GuestOrderPage({ params }: PageProps<"/checkout/order/[orderNumber]">) {
  const { orderNumber } = await params;
  return <GuestOrder orderNumber={orderNumber} />;
}
