import type { Metadata } from "next";
import { Suspense } from "react";
import { Skeleton } from "@/components/ui";
import { ReportsAdmin } from "@/features/reports/reports-admin";

export const metadata: Metadata = { title: "Reports" };

export default function AdminReportsPage() {
  return (
    <Suspense fallback={<Skeleton className="h-96 w-full rounded-2xl" />}>
      <ReportsAdmin />
    </Suspense>
  );
}
