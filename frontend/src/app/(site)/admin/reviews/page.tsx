import type { Metadata } from "next";
import { ReviewsAdmin } from "@/features/admin/reviews-admin";

export const metadata: Metadata = { title: "Reviews" };

export default function AdminReviewsPage() {
  return <ReviewsAdmin />;
}
