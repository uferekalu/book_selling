"use client";

import { CheckCircle2, ExternalLink, Loader2, Plus, RefreshCw, Trash2, TriangleAlert } from "lucide-react";
import { useMemo, useState } from "react";
import { Alert, Badge, Button, FormField, Icon, IconButton, Input, useToast } from "@/components/ui";
import {
  useRebuildPreviewMutation,
  useSetPreviewMutation,
  type AdminBook,
  type PreviewStatus,
} from "@/lib/api/catalog-admin-api";
import { errorMessage, errorProblems } from "@/lib/api/errors";
import { cn } from "@/lib/cn";
import { useAppSelector } from "@/lib/redux/hooks";
import { maxPreviewPages, parseSections, previewPageCount, type SectionDraft } from "../preview-sections";
import { useReportDirty } from "./dirty";
import { PageThumbnails } from "./page-thumbnails";
import { EditorSection } from "./section";

const STATUS: Record<PreviewStatus, { label: string; tone: "neutral" | "info" | "success" | "danger" }> = {
  none: { label: "Not set up", tone: "neutral" },
  queued: { label: "Waiting to build", tone: "info" },
  building: { label: "Building…", tone: "info" },
  ready: { label: "Ready", tone: "success" },
  failed: { label: "Failed", tone: "danger" },
};

const draftsFrom = (book: AdminBook): SectionDraft[] =>
  book.preview.sections.length
    ? book.preview.sections.map((s) => ({ label: s.label, fromPage: String(s.fromPage), toPage: String(s.toPage) }))
    : [
        { label: "Abstract", fromPage: "", toPage: "" },
        { label: "Introduction", fromPage: "", toPage: "" },
      ];

interface Baseline {
  drafts: SectionDraft[];
  firstPrinted: string;
}

const baselineFrom = (book: AdminBook): Baseline => ({
  drafts: draftsFrom(book),
  firstPrinted: String(book.preview.pageOffset + 1),
});

/**
 * Choose the free pages (PRODUCT_RULES §4): usually the abstract and the introduction, within the
 * cap. Saving builds the preview on the server; only those pages are ever sent to visitors.
 */
export function PreviewSection({ book }: { book: AdminBook }) {
  const [saved, setSaved] = useState(() => baselineFrom(book));
  const [drafts, setDrafts] = useState(saved.drafts);
  const [firstPrinted, setFirstPrinted] = useState(saved.firstPrinted);
  const [syncedAt, setSyncedAt] = useState(book.updatedAt);
  const [refused, setRefused] = useState<string[]>([]);
  const [save, saveState] = useSetPreviewMutation();
  const [rebuild, rebuildState] = useRebuildPreviewMutation();
  const { toast } = useToast();

  const dirty = JSON.stringify(drafts) !== JSON.stringify(saved.drafts) || firstPrinted !== saved.firstPrinted;
  useReportDirty("preview", dirty);

  if (book.updatedAt !== syncedAt) {
    setSyncedAt(book.updatedAt);
    const next = baselineFrom(book);
    setSaved(next);
    if (!dirty) {
      setDrafts(next.drafts);
      setFirstPrinted(next.firstPrinted);
    }
  }

  const manuscript = book.manuscript;
  const parsed = useMemo(
    () => (manuscript ? parseSections(drafts, manuscript.pages, book.preview.maxPercent) : null),
    [drafts, manuscript, book.preview.maxPercent],
  );
  const offsetValid = /^\d{1,3}$/.test(firstPrinted.trim()) && Number(firstPrinted) >= 1;

  if (!manuscript) {
    return (
      <EditorSection id="preview" title="Free preview" description="The pages anyone can read before buying.">
        <Alert tone="info">Upload the book PDF first; the preview is made from its pages.</Alert>
      </EditorSection>
    );
  }

  const max = maxPreviewPages(manuscript.pages, book.preview.maxPercent);
  const count = parsed ? previewPageCount(parsed.sections) : 0;
  const status = STATUS[book.preview.status];
  const working = book.preview.status === "queued" || book.preview.status === "building";

  const onSave = async () => {
    if (!parsed || parsed.problems.length || !offsetValid) {
      toast({ title: "Check the preview sections", description: parsed?.problems[0] ?? "Enter the PDF page of printed page 1.", tone: "danger" });
      return;
    }
    setRefused([]);
    try {
      await save({ id: book.id, sections: parsed.sections, pageOffset: Number(firstPrinted) - 1 }).unwrap();
      toast({ title: "Preview saved", description: "It's being built now; this takes a few seconds.", tone: "success" });
    } catch (error) {
      setRefused(errorProblems(error));
      toast({ title: errorMessage(error), tone: "danger" });
    }
  };

  const setDraft = (index: number, change: Partial<SectionDraft>) =>
    setDrafts((all) => all.map((d, i) => (i === index ? { ...d, ...change } : d)));

  return (
    <EditorSection
      id="preview"
      title="Free preview"
      description={`The pages anyone can read before buying, usually the abstract and the introduction. Up to ${max} pages (${book.preview.maxPercent}% of ${manuscript.pages}).`}
      dirty={dirty}
      saving={saveState.isLoading}
      onSave={() => void onSave()}
      onReset={() => {
        setDrafts(saved.drafts);
        setFirstPrinted(saved.firstPrinted);
      }}
      saveLabel="Save and build preview"
    >
      {/* Status of the built preview */}
      <div className="flex flex-col gap-3 rounded-xl border border-border bg-surface-sunken p-4 sm:flex-row sm:items-center">
        <div className="flex min-w-0 flex-1 items-start gap-3">
          <Icon
            icon={working ? Loader2 : book.preview.status === "failed" ? TriangleAlert : CheckCircle2}
            size="lg"
            className={cn(
              "mt-0.5 shrink-0",
              working && "animate-spin text-info",
              book.preview.status === "failed" && "text-danger",
              book.preview.status === "ready" && "text-success",
              book.preview.status === "none" && "text-text-subtle",
            )}
          />
          <div className="flex min-w-0 flex-col gap-1" aria-live="polite">
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone={status.tone}>{status.label}</Badge>
              {book.preview.enabled && (
                <span className="text-sm text-text-muted">
                  {book.preview.pageCount} pages{book.preview.teasers ? " · locked-page hints added" : ""}
                </span>
              )}
            </div>
            {book.preview.status === "failed" && book.preview.error && <p className="text-sm text-danger">{book.preview.error}</p>}
            {book.preview.enabled && !book.preview.builtFromCurrentFile && !working && (
              <p className="text-sm text-warning">Built from an earlier version of the book PDF. Rebuild to update it.</p>
            )}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {book.preview.enabled && <OpenPreviewButton bookId={book.id} />}
          {(book.preview.status === "failed" || (book.preview.enabled && !book.preview.builtFromCurrentFile)) && (
            <Button
              size="sm"
              variant="outline"
              isLoading={rebuildState.isLoading}
              leadingIcon={<Icon icon={RefreshCw} size="sm" />}
              onClick={() =>
                void rebuild(book.id)
                  .unwrap()
                  .then(() => toast({ title: "Rebuilding the preview", tone: "success" }))
                  .catch((error: unknown) => toast({ title: errorMessage(error), tone: "danger" }))
              }
            >
              Rebuild
            </Button>
          )}
        </div>
      </div>

      {/* Sections */}
      <fieldset className="flex flex-col gap-3">
        <legend className="mb-1 text-sm font-medium text-text">Free sections (PDF page numbers)</legend>
        {drafts.map((draft, index) => (
          <div key={index} className="grid grid-cols-[1fr_auto] items-end gap-3 rounded-xl border border-border p-3 sm:grid-cols-[1fr_6rem_6rem_auto]">
            <FormField label="Section" className="col-span-2 sm:col-span-1">
              <Input value={draft.label} onChange={(e) => setDraft(index, { label: e.target.value })} maxLength={80} placeholder="e.g. Introduction" />
            </FormField>
            <div className="col-span-2 grid grid-cols-[1fr_1fr_auto] items-end gap-3 sm:col-span-3 sm:grid-cols-[6rem_6rem_auto]">
              <FormField label="From page">
                <Input inputMode="numeric" value={draft.fromPage} onChange={(e) => setDraft(index, { fromPage: e.target.value })} />
              </FormField>
              <FormField label="To page">
                <Input inputMode="numeric" value={draft.toPage} onChange={(e) => setDraft(index, { toPage: e.target.value })} />
              </FormField>
              <IconButton
                label={`Remove ${draft.label || "section"}`}
                icon={<Icon icon={Trash2} size="sm" />}
                onClick={() => setDrafts((all) => all.filter((_, i) => i !== index))}
                disabled={drafts.length === 1}
              />
            </div>
          </div>
        ))}
        {drafts.length < 10 && (
          <Button
            variant="ghost"
            size="sm"
            className="self-start"
            leadingIcon={<Icon icon={Plus} size="sm" />}
            onClick={() => setDrafts((all) => [...all, { label: "", fromPage: "", toPage: "" }])}
          >
            Add a section
          </Button>
        )}
      </fieldset>

      <p className={cn("text-sm tabular-nums", count > max ? "text-danger" : "text-text-muted")} aria-live="polite">
        {count} of {max} free pages used
      </p>
      {dirty && parsed && parsed.problems.length > 0 && (
        <ul className="flex flex-col gap-1 text-sm text-danger">
          {parsed.problems.map((p) => (
            <li key={p}>{p}</li>
          ))}
        </ul>
      )}
      {refused.length > 0 && (
        <Alert tone="danger" title="Not saved">
          <ul className="list-disc pl-5">
            {refused.map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ul>
        </Alert>
      )}

      <FormField
        label="PDF page of printed page 1"
        hint="Most books have front matter (title page, contents) before page 1. This links the contents' page numbers to the right PDF pages, so readers see which chapters are free."
        error={offsetValid ? undefined : "Enter a page number"}
        className="sm:max-w-xs"
      >
        <Input inputMode="numeric" value={firstPrinted} onChange={(e) => setFirstPrinted(e.target.value)} />
      </FormField>

      <PageThumbnails book={book} selected={parsed?.sections ?? []} />
    </EditorSection>
  );
}

/** Opens the built preview (drafts too) in a new tab, with the staff session. */
function OpenPreviewButton({ bookId }: { bookId: string }) {
  const token = useAppSelector((state) => state.session.accessToken);
  const [busy, setBusy] = useState(false);
  const { toast } = useToast();
  const open = async () => {
    // Open the tab first (inside the click), so pop-up blockers allow it.
    const tab = window.open("", "_blank");
    setBusy(true);
    try {
      const response = await fetch(`/api/admin/catalog/books/${bookId}/preview-file`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!response.ok) throw new Error(`The preview could not be opened (${response.status}).`);
      const url = URL.createObjectURL(await response.blob());
      if (tab) tab.location.href = url;
      else window.location.href = url;
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (error) {
      tab?.close();
      toast({ title: (error as Error).message, tone: "danger" });
    } finally {
      setBusy(false);
    }
  };
  return (
    <Button size="sm" variant="outline" isLoading={busy} leadingIcon={<Icon icon={ExternalLink} size="sm" />} onClick={() => void open()}>
      Open preview
    </Button>
  );
}
