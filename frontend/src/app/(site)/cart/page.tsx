import type { Metadata } from "next";
import { CartPage } from "@/features/cart/cart-page";

export const metadata: Metadata = { title: "Your cart", robots: { index: false, follow: false } };

export default function Page() {
  return <CartPage />;
}
