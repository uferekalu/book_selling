import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "Engineering Books",
    template: "%s · Engineering Books",
  },
  description:
    "Mechanical engineering textbooks and ebooks — buy print or instant-download editions from anywhere in the world.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="flex min-h-full flex-col">{children}</body>
    </html>
  );
}
