import type { Metadata } from "next";
import { Breadcrumbs, Container } from "@/components/ui";
import { CheckoutFlow } from "@/features/checkout/checkout-flow";

export const metadata: Metadata = { title: "Checkout", robots: { index: false, follow: false } };

export default function CheckoutPage() {
  return (
    <Container width="narrow" className="flex flex-col gap-6 py-8 sm:py-12">
      <Breadcrumbs items={[{ label: "Cart", href: "/cart" }, { label: "Checkout" }]} />
      <h1 className="text-5xl font-medium">Checkout</h1>
      <CheckoutFlow />
    </Container>
  );
}
