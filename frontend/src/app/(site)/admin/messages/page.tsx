import type { Metadata } from "next";
import { Suspense } from "react";
import { Skeleton } from "@/components/ui";
import { AdminInbox } from "@/features/messaging/admin-inbox";

export const metadata: Metadata = { title: "Messages" };

export default function AdminMessagesPage() {
  return (
    <Suspense fallback={<Skeleton className="h-96 w-full rounded-2xl" />}>
      <AdminInbox />
    </Suspense>
  );
}
