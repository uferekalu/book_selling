import type { Metadata } from "next";
import { Suspense } from "react";
import { PaymentCallback } from "@/features/checkout/payment-callback";

export const metadata: Metadata = { title: "Payment", robots: { index: false, follow: false } };

export default function PaymentCallbackPage() {
  return (
    <Suspense>
      <PaymentCallback />
    </Suspense>
  );
}
