import type { Metadata } from "next";
import { DesignSystemShowcase } from "@/features/design-system/showcase";

export const metadata: Metadata = {
  title: "Design system",
  description: "Tokens and UI kit reference for the bookstore.",
  robots: { index: false, follow: false },
};

export default function DesignSystemPage() {
  return <DesignSystemShowcase />;
}
