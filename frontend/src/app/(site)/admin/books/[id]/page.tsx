import type { Metadata } from "next";
import { BookEditor } from "@/features/admin/book-editor/book-editor";

export const metadata: Metadata = { title: "Edit book" };

export default async function AdminBookPage({ params }: PageProps<"/admin/books/[id]">) {
  const { id } = await params;
  return <BookEditor id={id} />;
}
