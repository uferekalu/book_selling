import type { Metadata } from "next";
import { AuthorsManager } from "@/features/admin/authors-manager";

export const metadata: Metadata = { title: "Authors" };

export default function AdminAuthorsPage() {
  return <AuthorsManager />;
}
