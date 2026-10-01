"use client";

import type { ReactNode } from "react";
import { Badge, Button, Card } from "@/components/ui";

export const SECTIONS = [
  { id: "details", label: "Details" },
  { id: "text", label: "Abstract & description" },
  { id: "media", label: "Cover & sample pages" },
  { id: "file", label: "Book file" },
  { id: "preview", label: "Free preview" },
  { id: "formats", label: "Formats & prices" },
] as const;

export type SectionId = (typeof SECTIONS)[number]["id"];

/** One editor card: heading, body and a save bar that shows when there is something to save. */
export function EditorSection({
  id,
  title,
  description,
  children,
  dirty,
  saving,
  onSave,
  onReset,
  saveLabel = "Save",
  form,
}: {
  id: SectionId;
  title: string;
  description?: ReactNode;
  children: ReactNode;
  dirty?: boolean;
  saving?: boolean;
  onSave?: () => void;
  onReset?: () => void;
  saveLabel?: string;
  /** Id of a <form> inside, so the save button submits it (and Enter works). */
  form?: string;
}) {
  return (
    <Card as="section" id={id} aria-labelledby={`${id}-title`} className="scroll-mt-24 flex flex-col gap-5">
      <div className="flex flex-col gap-1">
        <div className="flex flex-wrap items-center gap-2">
          <h2 id={`${id}-title`} className="text-2xl font-medium">
            {title}
          </h2>
          {dirty && (
            <Badge tone="warning" size="sm">
              Unsaved
            </Badge>
          )}
        </div>
        {description && <p className="text-sm text-text-muted">{description}</p>}
      </div>
      {children}
      {(onSave || form) && (
        <div className="flex flex-col-reverse gap-2 border-t border-border pt-4 sm:flex-row sm:justify-end">
          {onReset && dirty && (
            <Button variant="ghost" onClick={onReset} disabled={saving}>
              Discard changes
            </Button>
          )}
          <Button type={form ? "submit" : "button"} form={form} onClick={form ? undefined : onSave} isLoading={saving} disabled={!dirty}>
            {saveLabel}
          </Button>
        </div>
      )}
    </Card>
  );
}
