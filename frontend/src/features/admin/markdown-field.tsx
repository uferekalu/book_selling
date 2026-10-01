"use client";

import { useState } from "react";
import { FormField, Skeleton, Tabs, Textarea } from "@/components/ui";
import { useMarkdownPreviewMutation } from "@/lib/api/catalog-admin-api";
import { errorMessage } from "@/lib/api/errors";

export interface MarkdownFieldProps {
  label: string;
  hint?: string;
  error?: string;
  value: string;
  onChange: (value: string) => void;
  maxLength: number;
  rows?: number;
  required?: boolean;
}

/**
 * Markdown with a Write / Preview switch. The preview is rendered by the API through the same
 * sanitizer the storefront uses, so what the editor sees is exactly what readers will see.
 */
export function MarkdownField({ label, hint, error, value, onChange, maxLength, rows = 10, required }: MarkdownFieldProps) {
  const [tab, setTab] = useState<"write" | "preview">("write");
  const [render, preview] = useMarkdownPreviewMutation();

  return (
    <div className="flex flex-col gap-2">
      <Tabs<"write" | "preview">
        label={`${label}: write or preview`}
        variant="pills"
        value={tab}
        onChange={(next) => {
          setTab(next);
          if (next === "preview") void render(value);
        }}
        items={[
          {
            value: "write",
            label: "Write",
            content: (
              <FormField
                label={label}
                hint={hint ?? "Markdown: **bold**, *italic*, ## headings, - lists, [links](https://…)."}
                error={error}
                required={required}
              >
                <Textarea value={value} onChange={(event) => onChange(event.target.value)} rows={rows} maxLength={maxLength} showCount />
              </FormField>
            ),
          },
          {
            value: "preview",
            label: "Preview",
            content: (
              <div className="min-h-40 rounded-lg border border-border bg-surface p-4 sm:p-6" aria-live="polite" aria-busy={preview.isLoading}>
                {preview.isLoading ? (
                  <div className="flex flex-col gap-3">
                    <Skeleton className="h-5 w-3/4" />
                    <Skeleton className="h-5 w-full" />
                    <Skeleton className="h-5 w-2/3" />
                  </div>
                ) : preview.isError ? (
                  <p className="text-danger">{errorMessage(preview.error)}</p>
                ) : preview.data?.html ? (
                  <div className="prose-book" dangerouslySetInnerHTML={{ __html: preview.data.html }} />
                ) : (
                  <p className="text-text-muted">Nothing to preview yet.</p>
                )}
              </div>
            ),
          },
        ]}
      />
    </div>
  );
}
