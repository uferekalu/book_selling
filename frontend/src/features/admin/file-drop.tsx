"use client";

import { UploadCloud } from "lucide-react";
import { useId, useRef, useState, type DragEvent } from "react";
import { Button, Icon, ProgressBar } from "@/components/ui";
import { cn } from "@/lib/cn";

export interface FileDropProps {
  /** e.g. "image/jpeg,image/png,image/webp" or "application/pdf". */
  accept: string;
  title: string;
  hint: string;
  onFile: (file: File) => void;
  disabled?: boolean;
  /** 0–1 while uploading; undefined when idle. */
  progress?: number;
  progressLabel?: string;
  onCancel?: () => void;
  className?: string;
}

/**
 * A large, thumb-friendly upload target: tap to pick a file on phones, or drag one in on desktop.
 * Shows progress and a cancel button while an upload runs.
 */
export function FileDrop({ accept, title, hint, onFile, disabled, progress, progressLabel, onCancel, className }: FileDropProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const hintId = useId();
  const [dragging, setDragging] = useState(false);
  const uploading = progress !== undefined;

  const take = (files: FileList | null) => {
    const file = files?.[0];
    if (file) onFile(file);
  };

  const onDrop = (event: DragEvent) => {
    event.preventDefault();
    setDragging(false);
    if (!disabled && !uploading) take(event.dataTransfer.files);
  };

  if (uploading) {
    return (
      <div className={cn("flex flex-col gap-3 rounded-2xl border border-border bg-surface-sunken p-5", className)}>
        <ProgressBar value={Math.round(progress * 100)} label={progressLabel ?? "Uploading"} showLabel valueText={`${Math.round(progress * 100)}%`} />
        {onCancel && (
          <Button size="sm" variant="ghost" className="self-start" onClick={onCancel}>
            Cancel upload
          </Button>
        )}
      </div>
    );
  }

  return (
    <div
      onDragOver={(event) => {
        event.preventDefault();
        if (!disabled) setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={onDrop}
      className={cn(
        "flex flex-col items-center gap-3 rounded-2xl border-2 border-dashed px-5 py-8 text-center transition-colors",
        dragging ? "border-primary bg-primary-subtle" : "border-border-strong bg-surface",
        disabled && "opacity-60",
        className,
      )}
    >
      <span className="flex size-12 items-center justify-center rounded-full bg-secondary text-primary">
        <Icon icon={UploadCloud} size="lg" />
      </span>
      <p className="font-medium text-text">{title}</p>
      <p id={hintId} className="max-w-sm text-sm text-text-muted">
        {hint}
      </p>
      <Button variant="outline" disabled={disabled} onClick={() => inputRef.current?.click()} aria-describedby={hintId}>
        Choose a file
      </Button>
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        className="sr-only"
        tabIndex={-1}
        aria-hidden
        onChange={(event) => {
          take(event.target.files);
          event.target.value = "";
        }}
      />
    </div>
  );
}
