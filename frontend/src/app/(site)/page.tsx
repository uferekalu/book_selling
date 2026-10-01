import { BookOpen } from "lucide-react";
import { BookCover, ButtonLink, Container, Eyebrow, Icon } from "@/components/ui";

// Brand preview until the storefront home is built (docs/ROADMAP.md BS-5 / BS-13).
export default function Home() {
  return (
    <div className="surface-grain flex flex-1 items-center overflow-hidden py-16 sm:py-24">
      <Container className="grid items-center gap-12 lg:grid-cols-[1.1fr_0.9fr] lg:gap-20">
        <div className="flex animate-rise-in flex-col items-start gap-6">
          <Eyebrow>Opening soon</Eyebrow>
          <h1 className="text-6xl font-medium text-text">
            Engineering books that <em className="text-primary">explain</em>, not just describe.
          </h1>
          <p className="max-w-xl text-lg text-text-muted">
            Mechanical engineering textbooks by a working lecturer, in print and as instant ebooks. Read the
            introduction of any book free, before you buy.
          </p>
          <div className="flex w-full flex-col gap-3 sm:w-auto sm:flex-row">
            <ButtonLink href="/design-system" size="lg" variant="primary" fullWidth className="sm:w-auto">
              <Icon icon={BookOpen} size="sm" />
              Preview the design system
            </ButtonLink>
          </div>
        </div>
        <div className="relative flex justify-center lg:justify-end" aria-hidden="true">
          <div className="absolute inset-x-10 bottom-0 h-1/2 rounded-full bg-accent/20 blur-3xl" />
          <div className="relative flex items-end gap-4 sm:gap-6">
            <BookCover title="Engineering Thermodynamics" author="Prof. A. Author" size="lg" priority className="-rotate-3" />
            <BookCover title="Fluid Mechanics in Practice" author="Prof. A. Author" size="md" className="hidden translate-y-6 rotate-2 sm:block" />
          </div>
        </div>
      </Container>
    </div>
  );
}
