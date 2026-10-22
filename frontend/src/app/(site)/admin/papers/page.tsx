import type { Metadata } from "next";
import { BooksList } from "@/features/admin/books-list";

export const metadata: Metadata = { title: "Papers" };

/** Conference and workshop papers (BS-34): the same editor as books, with paper details. */
export default function AdminPapersPage() {
  return <BooksList kind="paper" />;
}
