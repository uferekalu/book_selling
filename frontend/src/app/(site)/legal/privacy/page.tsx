import type { Metadata } from "next";
import { PendingPolicy } from "@/features/legal/pending-policy";

export const metadata: Metadata = { title: "Privacy Policy" };

export default function PrivacyPage() {
  return (
    <PendingPolicy
      title="Privacy Policy"
      summary={[
        "We collect only what we need to sell and deliver your books: your name, email, delivery address and order history.",
        "Card details are entered on our payment providers' secure pages (Paystack, Flutterwave, Stripe) and never reach our servers.",
        "We send marketing emails only if you opt in, and you can opt out at any time.",
        "You can ask for a copy of your data or for your account to be deleted, in line with Nigeria's Data Protection Act and the GDPR.",
      ]}
    />
  );
}
