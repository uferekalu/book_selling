import type { Metadata } from "next";
import { CouponsAdmin } from "@/features/admin/coupons-admin";

export const metadata: Metadata = { title: "Discount codes" };

export default function AdminCouponsPage() {
  return <CouponsAdmin />;
}
