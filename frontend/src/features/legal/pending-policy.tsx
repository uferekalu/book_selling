import { Alert, Container, Eyebrow } from "@/components/ui";

/**
 * Honest placeholder until the owner approves the final wording (docs/ROADMAP.md BS-13). The
 * store doesn't take payments before then, so nobody is bound by text that doesn't exist yet.
 */
export function PendingPolicy({ title, summary }: { title: string; summary: string[] }) {
  return (
    <Container width="prose" className="flex flex-col gap-6 py-12 sm:py-20">
      <Eyebrow>Legal</Eyebrow>
      <h1 className="text-5xl font-medium">{title}</h1>
      <Alert tone="info" title="The full text is being finalised">
        It will be published here before the store starts taking orders. Until then, these are the principles it
        will follow.
      </Alert>
      <ul className="flex list-disc flex-col gap-3 pl-5 text-text-muted">
        {summary.map((point) => (
          <li key={point}>{point}</li>
        ))}
      </ul>
    </Container>
  );
}
