import type { Metadata } from "next";
import { DashboardAdmin } from "@/features/admin/dashboard-admin";

export const metadata: Metadata = { title: "Dashboard" };

export default function AdminHome() {
  return <DashboardAdmin />;
}
