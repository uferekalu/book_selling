"use client";

import { BookOpen, Lock } from "lucide-react";
import { useState } from "react";
import { Alert, Button, Drawer, Icon } from "@/components/ui";
import { cn } from "@/lib/cn";
import type { PreviewData, PreviewOutlineEntry } from "./reader-logic";

/**
 * The whole table of contents (PRODUCT_RULES §4.4). Free chapters jump to their page; a locked
 * chapter explains that it is in the full book and offers the buying options.
 */
export function ReaderContents({
  open,
  onClose,
  preview,
  currentPage,
  onJump,
  onLocked,
  onShowOptions,
}: {
  open: boolean;
  onClose: () => void;
  preview: PreviewData;
  currentPage: number;
  onJump: (previewPage: number) => void;
  onLocked: (entry: PreviewOutlineEntry) => void;
  onShowOptions: () => void;
}) {
  const [locked, setLocked] = useState<PreviewOutlineEntry | null>(null);
  const entries: PreviewOutlineEntry[] = preview.outline.length
    ? preview.outline
    : preview.sections.map((s) => ({ title: s.label, level: 1 as const, page: s.fromPage, previewPage: s.previewPage }));

  return (
    <Drawer
      open={open}
      onClose={() => {
        setLocked(null);
        onClose();
      }}
      title="Contents"
      side="left"
    >
      <div className="flex flex-col gap-4">
        {locked && (
          <Alert
            tone="info"
            title={`“${locked.title}” is in the full book`}
            action={
              <Button
                size="sm"
                onClick={() => {
                  setLocked(null);
                  onShowOptions();
                }}
              >
                See buying options
              </Button>
            }
          >
            {locked.page ? `It starts on page ${locked.page}. ` : ""}The free preview covers {preview.sections.map((s) => s.label.toLowerCase()).join(" and ")}.
          </Alert>
        )}
        <ol className="flex flex-col">
          {entries.map((entry, index) => {
            const free = entry.previewPage !== null;
            const here =
              free &&
              entry.previewPage! <= currentPage &&
              !entries.slice(index + 1).some((e) => e.previewPage !== null && e.previewPage <= currentPage);
            return (
              <li key={`${entry.title}-${index}`}>
                <button
                  type="button"
                  onClick={() => {
                    if (free) {
                      onJump(entry.previewPage!);
                      onClose();
                    } else {
                      setLocked(entry);
                      onLocked(entry);
                    }
                  }}
                  aria-current={here ? "location" : undefined}
                  className={cn(
                    "flex min-h-11 w-full items-center gap-3 rounded-lg py-2 pr-2 text-left text-sm transition-colors hover:bg-secondary",
                    entry.level === 2 ? "pl-8" : "pl-2",
                    here && "bg-primary-subtle text-on-primary-subtle",
                    !free && "text-text-muted",
                  )}
                >
                  <Icon icon={free ? BookOpen : Lock} size="sm" className={cn("shrink-0", free ? "text-primary" : "text-text-subtle")} />
                  <span className="min-w-0 flex-1">{entry.title}</span>
                  {entry.page && <span className="text-xs text-text-subtle tabular-nums">{entry.page}</span>}
                  <span className="sr-only">{free ? "(free preview)" : "(in the full book)"}</span>
                </button>
              </li>
            );
          })}
        </ol>
      </div>
    </Drawer>
  );
}
