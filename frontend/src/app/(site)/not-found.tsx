import { BookX } from "lucide-react";
import { ButtonLink, Container, EmptyState } from "@/components/ui";

/** Shown when a book, author or page does not exist (or has been unpublished). */
export default function NotFound() {
  return (
    <Container className="flex flex-1 items-center justify-center py-16">
      <EmptyState
        icon={BookX}
        title="We couldn’t find that page"
        description="The book may have been renamed or is no longer available. The full catalogue is one click away."
        action={<ButtonLink href="/books">Browse all books</ButtonLink>}
      />
    </Container>
  );
}
