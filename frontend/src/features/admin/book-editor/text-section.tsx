"use client";

import { useMemo, useState } from "react";
import { Alert, FormField, Textarea, useToast } from "@/components/ui";
import { useUpdateBookMutation, type AdminBook } from "@/lib/api/catalog-admin-api";
import { errorMessage } from "@/lib/api/errors";
import { formatToc, parseToc } from "../toc";
import { MarkdownField } from "../markdown-field";
import { useReportDirty } from "./dirty";
import { EditorSection } from "./section";

const MIN_ABSTRACT_CHARS = 80;

function plainLength(markdown: string) {
  return markdown
    .replace(/[#>*_`~[\]()!-]/g, "")
    .replace(/\s+/g, " ")
    .trim().length;
}

interface TextValues {
  abstractMarkdown: string;
  descriptionMarkdown: string;
  toc: string;
}

const fromBook = (book: AdminBook): TextValues => ({
  abstractMarkdown: book.abstractMarkdown,
  descriptionMarkdown: book.descriptionMarkdown,
  toc: formatToc(book.tableOfContents),
});

export function TextSection({ book }: { book: AdminBook }) {
  const [saved, setSaved] = useState(() => fromBook(book));
  const [values, setValues] = useState(saved);
  const [update, state] = useUpdateBookMutation();
  const { toast } = useToast();
  const toc = useMemo(() => parseToc(values.toc), [values.toc]);
  const dirty = values.abstractMarkdown !== saved.abstractMarkdown || values.descriptionMarkdown !== saved.descriptionMarkdown || values.toc !== saved.toc;
  useReportDirty("text", dirty);

  // When the server copy changes (this or another section saved), refresh the baseline, and the
  // fields too unless they hold unsaved edits. Done during render, as React recommends.
  const [syncedAt, setSyncedAt] = useState(book.updatedAt);
  if (book.updatedAt !== syncedAt) {
    setSyncedAt(book.updatedAt);
    const next = fromBook(book);
    setSaved(next);
    if (!dirty) setValues(next);
  }

  const abstractLength = plainLength(values.abstractMarkdown);

  const save = async () => {
    if (toc.problems.length) {
      toast({ title: "Fix the table of contents first", description: toc.problems[0], tone: "danger" });
      return;
    }
    try {
      const result = await update({
        id: book.id,
        changes: {
          abstractMarkdown: values.abstractMarkdown,
          descriptionMarkdown: values.descriptionMarkdown,
          tableOfContents: toc.entries,
        },
      }).unwrap();
      const next = fromBook(result);
      setSaved(next);
      setValues(next);
      toast({ title: "Text saved", tone: "success" });
    } catch (error) {
      toast({ title: errorMessage(error), tone: "danger" });
    }
  };

  return (
    <EditorSection
      id="text"
      title="Abstract & description"
      description="The abstract opens the book page and the free preview; the description tells readers what they will learn."
      dirty={dirty}
      saving={state.isLoading}
      onSave={() => void save()}
      onReset={() => setValues(saved)}
    >
      <MarkdownField
        label="Abstract"
        required
        value={values.abstractMarkdown}
        onChange={(abstractMarkdown) => setValues((v) => ({ ...v, abstractMarkdown }))}
        maxLength={10_000}
        rows={8}
        hint={
          abstractLength < MIN_ABSTRACT_CHARS
            ? `At least ${MIN_ABSTRACT_CHARS} characters (${abstractLength} so far). Markdown works: **bold**, *italic*, lists.`
            : "Shown at the top of the book page and before the free preview. Markdown works."
        }
      />
      <MarkdownField
        label="Description"
        required
        value={values.descriptionMarkdown}
        onChange={(descriptionMarkdown) => setValues((v) => ({ ...v, descriptionMarkdown }))}
        maxLength={50_000}
        rows={12}
        hint="Who the book is for, what it covers, what's new in this edition. Use ## for headings and - for lists."
      />
      <div className="flex flex-col gap-3">
        <FormField
          label="Table of contents"
          hint='One line per chapter; indent a line (or start it with "-") for a section. Put the page number at the end, e.g. "Moulding sands ..... 27".'
        >
          <Textarea
            value={values.toc}
            onChange={(event) => setValues((v) => ({ ...v, toc: event.target.value }))}
            rows={10}
            spellCheck={false}
            className="font-mono text-sm"
            placeholder={"Introduction to foundry practice ..... 1\n  History of metal casting ..... 3\nMoulding sands ..... 27"}
          />
        </FormField>
        {toc.problems.length > 0 && (
          <Alert tone="warning" title="Check the table of contents">
            <ul className="list-disc pl-5">
              {toc.problems.map((problem) => (
                <li key={problem}>{problem}</li>
              ))}
            </ul>
          </Alert>
        )}
        {toc.entries.length > 0 && (
          <p className="text-sm text-text-muted">
            {toc.entries.length} {toc.entries.length === 1 ? "chapter" : "chapters"},{" "}
            {toc.entries.reduce((n, e) => n + (e.children?.length ?? 0), 0)} sections.
          </p>
        )}
      </div>
    </EditorSection>
  );
}
