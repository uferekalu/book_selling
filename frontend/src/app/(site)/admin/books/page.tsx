import type { Metadata } from "next";
import { BooksList } from "@/features/admin/books-list";

export const metadata: Metadata = { title: "Books" };

export default function AdminBooksPage() {
  return <BooksList />;
}
