import type { Metadata } from "next";
import { Container, Eyebrow } from "@/components/ui";
import { ContactForm } from "@/features/messaging/contact-form";

export const metadata: Metadata = {
  title: "Contact",
  description: "Questions about a book, bulk orders for a department or anything else: write to the author.",
};

export default function ContactPage() {
  return (
    <Container className="flex max-w-2xl flex-col gap-6 py-10 sm:py-16">
      <div className="flex flex-col gap-2">
        <Eyebrow>Contact</Eyebrow>
        <h1 className="text-4xl font-medium">Write to the author</h1>
        <p className="text-text-muted">
          Questions about a book, copies for a class or department, or anything else. The reply comes to your email.
        </p>
      </div>
      <ContactForm />
    </Container>
  );
}
