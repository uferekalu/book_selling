import type { Metadata } from "next";
import { ShippingManager } from "@/features/admin/shipping-manager";

export const metadata: Metadata = { title: "Shipping" };

export default function AdminShippingPage() {
  return <ShippingManager />;
}
