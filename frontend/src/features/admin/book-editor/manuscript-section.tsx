"use client";

import { FileCheck2, Lock } from "lucide-react";
import { useState } from "react";
import { Alert, Checkbox, Icon, Spinner, useToast } from "@/components/ui";
import { useAttachManuscriptMutation, type AdminBook } from "@/lib/api/catalog-admin-api";
import { errorMessage } from "@/lib/api/errors";
import { formatBytes } from "@/lib/upload";
import { FileDrop } from "../file-drop";
import { EditorSection } from "./section";
import { useManuscriptUpload } from "./use-manuscript-upload";

const uploadedOn = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" });

/** The complete book as a private PDF: never public; buyers get personalised copies from it. */
export function ManuscriptSection({ book }: { book: AdminBook }) {
  const { upload, cancel, progress } = useManuscriptUpload(book.id);
  const [attach, attachState] = useAttachManuscriptMutation();
  const [notifyBuyers, setNotifyBuyers] = useState(false);
  const { toast } = useToast();
  // Replacing the file of a book that was ever on sale reaches its owners (BS-9).
  const replacingSoldBook = Boolean(book.manuscript && book.listedAt);

  const choose = async (file: File) => {
    try {
      const key = await upload(file);
      if (!key) return;
      const saved = await attach({ id: book.id, key, notifyBuyers: replacingSoldBook && notifyBuyers }).unwrap();
      setNotifyBuyers(false);
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
          Everyone who owns the ebook gets the new edition in their library automatically (their personal copies are made
          again). Copies they downloaded before don’t change.
        </Alert>
      )}
      {replacingSoldBook && (
        <Checkbox
          label="Email existing buyers about the updated edition"
          description="Worth it for a new edition or important corrections; leave it off for small fixes."
          checked={notifyBuyers}
          onChange={(e) => setNotifyBuyers(e.target.checked)}
          disabled={attachState.isLoading || progress !== undefined}
        />
      )}
      {attachState.isLoading ? (
        <div className="flex items-center gap-3 rounded-2xl border border-border bg-surface-sunken p-5" aria-live="polite">
          <Spinner label="Checking the book PDF" />
          <p className="text-sm text-text-muted">Checking the PDF and counting its pages. A large book can take up to a minute.</p>
        </div>
      ) : (
        <FileDrop
          accept="application/pdf"
          title={book.manuscript ? "Replace the book PDF" : "Upload the book PDF"}
          hint="PDF only. The file goes up in pieces, so a dropped connection only repeats one piece. Keep this page open until it finishes."
          onFile={(file) => void choose(file)}
          progress={progress}
          progressLabel="Uploading book PDF"
          onCancel={cancel}
        />
      )}
      <p className="flex items-center gap-2 text-xs text-text-subtle">
        <Icon icon={Lock} size="xs" /> Uploaded directly to private storage over an encrypted connection.
      </p>
    </EditorSection>
  );
}
