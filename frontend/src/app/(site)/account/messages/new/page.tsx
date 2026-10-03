import type { Metadata } from "next";
import { Suspense } from "react";
import { Skeleton } from "@/components/ui";
import { NewConversation } from "@/features/messaging/customer-messages";

export const metadata: Metadata = { title: "New message" };

export default function NewMessagePage() {
  // useSearchParams (book / order) needs a Suspense boundary in a statically rendered page.
  return (
    <Suspense fallback={<Skeleton className="h-96 w-full rounded-2xl" />}>
      <NewConversation />
    </Suspense>
  );
}
