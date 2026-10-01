import type { Metadata } from "next";
import { CategoriesManager } from "@/features/admin/categories-manager";

export const metadata: Metadata = { title: "Subjects" };

export default function AdminCategoriesPage() {
  return <CategoriesManager />;
}
