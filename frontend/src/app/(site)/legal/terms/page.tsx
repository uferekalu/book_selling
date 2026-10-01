import type { Metadata } from "next";
import { PendingPolicy } from "@/features/legal/pending-policy";

export const metadata: Metadata = { title: "Terms of Sale" };

export default function TermsPage() {
  return (
    <PendingPolicy
      title="Terms of Sale"
      summary={[
        "Prices are shown in your currency and include any applicable tax. The price you see at checkout is exactly what you pay.",
        "Ebooks are for your personal use. Your copy may be personalised with your name and order number.",
        "Print orders ship to the address you give at checkout, with the cost and delivery estimate shown before you pay.",
        "Refunds: ebooks within 7 days if not downloaded or read beyond the free preview; print within 14 days of delivery in original condition; damaged or wrong items are always replaced or refunded.",
      ]}
    />
  );
}
