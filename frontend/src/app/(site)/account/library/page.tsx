import type { Metadata } from "next";
import { LibraryList } from "@/features/library/library-list";

export const metadata: Metadata = { title: "Library" };

export default function LibraryPage() {
  return <LibraryList />;
}
