"use client";

import { FileCheck2, Lock } from "lucide-react";
import { Alert, Icon, useToast } from "@/components/ui";
import { useAttachManuscriptMutation, type AdminBook } from "@/lib/api/catalog-admin-api";
import { errorMessage } from "@/lib/api/errors";
import { formatBytes } from "@/lib/upload";
import { FileDrop } from "../file-drop";
import { EditorSection } from "./section";
import { useUpload } from "./use-upload";

const uploadedOn = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" });

/** The complete book as a private PDF: never public; buyers get personalised copies from it. */
export function ManuscriptSection({ book }: { book: AdminBook }) {
  const { upload, cancel, progress } = useUpload("manuscript", book.id);
  const [attach, attachState] = useAttachManuscriptMutation();
  const { toast } = useToast();

  const choose = async (file: File) => {
    try {
      const asset = await upload(file);
      if (!asset) return;
      const saved = await attach({ id: book.id, publicId: asset.public_id }).unwrap();
      toast({
        title: "Book file saved",
        description: saved.manuscript ? `${saved.manuscript.pages} pages · ${formatBytes(saved.manuscript.bytes)}` : undefined,
        tone: "success",
      });
    } catch (error) {
      toast({ title: "The book file wasn't saved", description: errorMessage(error, (error as Error).message), tone: "danger" });
    }
  };

  return (
    <EditorSection
      id="file"
      title="Book file"
      description="The complete book as a PDF. It's stored privately: never shown publicly, and only reachable by buyers through short-lived personal links."
    >
      {book.manuscript ? (
        <div className="flex items-start gap-3 rounded-xl border border-border bg-surface-sunken p-4">
          <Icon icon={FileCheck2} size="lg" className="mt-0.5 shrink-0 text-success" />
          <div className="flex min-w-0 flex-col gap-0.5">
            <p className="font-medium text-text">
              {book.manuscript.pages} pages · {formatBytes(book.manuscript.bytes)}
            </p>
            <p className="text-sm text-text-muted">Uploaded {uploadedOn.format(new Date(book.manuscript.uploadedAt))}</p>
          </div>
        </div>
      ) : null}
      {book.manuscript && book.listedAt && (
        <Alert tone="info" title="Replacing the file of a book on sale">
          New buyers get the new file. Existing buyers keep the version they bought until library updates arrive (planned
          with the reading library).
        </Alert>
      )}
      <FileDrop
        accept="application/pdf"
        title={book.manuscript ? "Replace the book PDF" : "Upload the book PDF"}
        hint="PDF only. Large files upload in pieces, so a dropped connection only repeats the last piece. Keep this page open until it finishes."
        onFile={(file) => void choose(file)}
        progress={progress}
        progressLabel="Uploading book PDF"
        onCancel={cancel}
        disabled={attachState.isLoading}
      />
      <p className="flex items-center gap-2 text-xs text-text-subtle">
        <Icon icon={Lock} size="xs" /> Uploaded directly to private storage over an encrypted connection.
      </p>
    </EditorSection>
  );
}
