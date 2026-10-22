"use client";

import { CheckCircle2, Circle, ExternalLink } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Alert, Badge, Button, ButtonLink, Card, ConfirmDialog, Icon, useToast } from "@/components/ui";
import { useBookStatusMutation, useDeleteBookMutation, type AdminBook } from "@/lib/api/catalog-admin-api";
import { errorMessage, errorProblems } from "@/lib/api/errors";
import { STATUS_BADGE } from "../books-list";
import { useDirtyRegistry } from "./dirty";
import { titlePath } from "@/lib/catalog-links";
import { sectionsFor } from "./section";

/** Every requirement, ticked off as the API stops listing it. Order matches the editor. */
const CHECKS: Array<{ label: string; section: string; matches: (problem: string) => boolean }> = [
  { label: "Title and author", section: "details", matches: (p) => /title|author/i.test(p) },
  { label: "Abstract", section: "text", matches: (p) => /abstract/i.test(p) },
  { label: "Description", section: "text", matches: (p) => /description/i.test(p) },
  { label: "Cover", section: "media", matches: (p) => /cover/i.test(p) },
  { label: "Book PDF", section: "file", matches: (p) => /manuscript|PDF/i.test(p) },
  { label: "Free preview", section: "preview", matches: (p) => /preview/i.test(p) },
  { label: "Formats and prices", section: "formats", matches: (p) => /format|price/i.test(p) },
];

/** A paper's checklist (BS-34): the API's paper problems, grouped the same way. */
const PAPER_CHECKS: typeof CHECKS = [
  { label: "Title and author", section: "details", matches: (p) => /title|author/i.test(p) },
  { label: "Where it was presented", section: "paper", matches: (p) => /presented or published/i.test(p) },
  { label: "Publisher link", section: "paper", matches: (p) => /publisher/i.test(p) },
  { label: "Abstract", section: "text", matches: (p) => /abstract/i.test(p) },
  { label: "Paper PDF", section: "file", matches: (p) => /upload the paper/i.test(p) },
  { label: "Free first pages", section: "preview", matches: (p) => /preview/i.test(p) },
  { label: "Price", section: "formats", matches: (p) => /price|ebook|print/i.test(p) },
];

export function PublishPanel({ book }: { book: AdminBook }) {
  const [setStatus, statusState] = useBookStatusMutation();
  const [remove, removeState] = useDeleteBookMutation();
  const [confirm, setConfirm] = useState<"unpublish" | "archive" | "delete" | null>(null);
  const [refused, setRefused] = useState<string[]>([]);
  const { dirty } = useDirtyRegistry();
  const { toast } = useToast();
  const router = useRouter();
  const badge = STATUS_BADGE[book.status];
  const isPaper = book.kind === "paper";
  const noun = isPaper ? "paper" : "book";
  const sections = sectionsFor(book);
  const sectionLabel = (id: string) => sections.find((s) => s.id === id)?.label ?? id;
  // Only the checks that apply: a paper read at the publisher has no PDF, preview or price here.
  const checks = isPaper ? PAPER_CHECKS.filter((check) => sections.some((s) => s.id === check.section)) : CHECKS;
  const ready = book.publishProblems.length === 0;
  const canDelete = book.status === "draft" && !book.listedAt;

  const run = async (action: "publish" | "unpublish" | "archive") => {
    setRefused([]);
    try {
      await setStatus({ id: book.id, action }).unwrap();
      toast({
        title:
          action === "publish"
            ? isPaper && book.paper?.access === "external"
              ? "Published: the paper is listed"
              : `Published: the ${noun} is on sale`
            : action === "unpublish"
              ? "Moved back to drafts"
              : "Archived",
        tone: "success",
      });
    } catch (error) {
      setRefused(errorProblems(error));
      toast({ title: errorMessage(error), tone: "danger" });
    } finally {
      setConfirm(null);
    }
  };

  return (
    <Card className="flex flex-col gap-5">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-xl font-medium">Status</h2>
        <Badge tone={badge.tone}>{badge.label}</Badge>
      </div>

      {dirty.size > 0 && (
        <Alert tone="warning" title="Unsaved changes">
          Save {[...dirty].map(sectionLabel).join(", ")} first; publishing uses what is saved.
        </Alert>
      )}

      {book.status !== "published" && (
        <div className="flex flex-col gap-3">
          <p className="text-sm text-text-muted">{ready ? "Everything is in place." : "Before it can go on sale:"}</p>
          <ul className="flex flex-col gap-2">
            {checks.map((check) => {
              const problems = book.publishProblems.filter(check.matches);
              const done = problems.length === 0;
              return (
                <li key={check.label} className="flex items-start gap-2.5 text-sm">
                  <Icon icon={done ? CheckCircle2 : Circle} size="sm" className={done ? "mt-0.5 shrink-0 text-success" : "mt-0.5 shrink-0 text-text-subtle"} />
                  <span className="flex flex-col">
                    {done ? (
                      <span className="text-text">{check.label}</span>
                    ) : (
                      <a href={`#${check.section}`} className="font-medium text-text underline-offset-4 hover:underline">
                        {check.label}
                      </a>
                    )}
                    {problems.map((p) => (
                      <span key={p} className="text-text-muted">
                        {p}
                      </span>
                    ))}
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {refused.length > 0 && (
        <Alert tone="danger" title="Not published">
          <ul className="list-disc pl-5">
            {refused.map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ul>
        </Alert>
      )}

      <div className="flex flex-col gap-2">
        {book.status !== "published" && (
          <Button fullWidth size="lg" disabled={!ready || dirty.size > 0} isLoading={statusState.isLoading && confirm === null} onClick={() => void run("publish")}>
            {book.status === "archived" ? "Publish again" : "Publish"}
          </Button>
        )}
        {book.status === "published" && (
          <>
            <ButtonLink href={titlePath(book.kind, book.slug)} variant="outline" fullWidth target="_blank" rel="noopener">
              View in the store
              <Icon icon={ExternalLink} size="sm" />
            </ButtonLink>
            <Button variant="secondary" fullWidth onClick={() => setConfirm("unpublish")}>
              Unpublish
            </Button>
          </>
        )}
        {book.status !== "archived" && book.listedAt && (
          <Button variant="ghost" fullWidth onClick={() => setConfirm("archive")}>
            Archive
          </Button>
        )}
        {canDelete && (
          <Button variant="ghost" fullWidth className="text-danger" onClick={() => setConfirm("delete")}>
            Delete draft
          </Button>
        )}
      </div>

      <ConfirmDialog
        open={confirm === "unpublish" || confirm === "archive"}
        onCancel={() => setConfirm(null)}
        onConfirm={() => void run(confirm as "unpublish" | "archive")}
        title={confirm === "archive" ? `Archive this ${noun}?` : `Take this ${noun} off the store?`}
        description={
          confirm === "archive"
            ? "It disappears from the store. Buyers keep their copies. You can publish it again later."
            : "It disappears from the store until you publish it again. Buyers keep their copies."
        }
        confirmLabel={confirm === "archive" ? "Archive" : "Unpublish"}
        tone="danger"
        isConfirming={statusState.isLoading}
      />
      <ConfirmDialog
        open={confirm === "delete"}
        onCancel={() => setConfirm(null)}
        onConfirm={() =>
          void remove(book.id)
            .unwrap()
            .then(() => {
              toast({ title: "Draft deleted", tone: "success" });
              router.replace(isPaper ? "/admin/papers" : "/admin/books");
            })
            .catch((error: unknown) => toast({ title: errorMessage(error), tone: "danger" }))
            .finally(() => setConfirm(null))
        }
        title="Delete this draft for good?"
        description={`Its cover and ${noun} file are deleted too. This can't be undone.`}
        confirmLabel="Delete"
        tone="danger"
        isConfirming={removeState.isLoading}
      />
    </Card>
  );
}
