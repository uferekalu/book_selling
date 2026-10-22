import type { Metadata } from "next";
import { BookEditor } from "@/features/admin/book-editor/book-editor";

export const metadata: Metadata = { title: "Edit paper" };

export default async function AdminPaperPage({ params }: PageProps<"/admin/papers/[id]">) {
  const { id } = await params;
  return <BookEditor id={id} />;
}
