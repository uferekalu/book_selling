"use client";

import { Trash2 } from "lucide-react";
import Image from "next/image";
import { useEffect, useState } from "react";
import { BookCover, Button, ConfirmDialog, FormField, Icon, IconButton, Input, Modal, Spinner, useToast } from "@/components/ui";
import { useAddGalleryImageMutation, useAttachCoverMutation, useRemoveGalleryImageMutation, type AdminBook } from "@/lib/api/catalog-admin-api";
import { errorMessage } from "@/lib/api/errors";
import { formatBytes } from "@/lib/upload";
import { CENTRED, coverSizeProblem, cropRect, imageSize, type CropState } from "../crop";
import { FileDrop } from "../file-drop";
import { CoverCropper } from "./cover-cropper";
import { EditorSection } from "./section";
import { useUpload } from "./use-upload";

const IMAGE_TYPES = "image/jpeg,image/png,image/webp";
const MAX_GALLERY = 8;

interface PendingCover {
  file: File;
  url: string;
  width: number;
  height: number;
}

export function MediaSection({ book }: { book: AdminBook }) {
  return (
    <EditorSection
      id="media"
      title="Cover & sample pages"
      description="A sharp cover sells the book. Sample pages (optional) show the layout, figures and tables inside."
    >
      <CoverPanel book={book} />
      <GalleryPanel book={book} />
    </EditorSection>
  );
}

function CoverPanel({ book }: { book: AdminBook }) {
  const { upload, cancel, progress } = useUpload("cover", book.id);
  const [attach, attachState] = useAttachCoverMutation();
  const [pending, setPending] = useState<PendingCover | null>(null);
  const [crop, setCrop] = useState<CropState>(CENTRED);
  const [alt, setAlt] = useState("");
  const { toast } = useToast();

  useEffect(() => () => {
    if (pending) URL.revokeObjectURL(pending.url);
  }, [pending]);

  const choose = async (file: File) => {
    const url = URL.createObjectURL(file);
    try {
      const size = await imageSize(url);
      const problem = coverSizeProblem(size.width, size.height);
      if (problem) {
        URL.revokeObjectURL(url);
        toast({ title: "That image is too small for a cover", description: problem, tone: "danger" });
        return;
      }
      setCrop(CENTRED);
      setAlt(book.cover?.alt && book.cover.alt !== book.title ? book.cover.alt : "");
      setPending({ file, url, ...size });
    } catch (error) {
      URL.revokeObjectURL(url);
      toast({ title: (error as Error).message, tone: "danger" });
    }
  };

  const confirm = async () => {
    if (!pending) return;
    const target = pending;
    setPending(null);
    try {
      const asset = await upload(target.file);
      if (!asset) return;
      await attach({ id: book.id, publicId: asset.public_id, crop: cropRect(target.width, target.height, crop), alt: alt.trim() || undefined }).unwrap();
      toast({ title: "Cover updated", tone: "success" });
    } catch (error) {
      toast({ title: "The cover wasn't saved", description: errorMessage(error, (error as Error).message), tone: "danger" });
    } finally {
      URL.revokeObjectURL(target.url);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <h3 className="text-lg font-medium">Cover</h3>
      <div className="flex flex-col gap-5 sm:flex-row sm:items-start">
        <div className="relative self-center sm:self-start">
          <BookCover title={book.title} src={book.cover?.src} blurDataUrl={book.cover?.blurDataUrl} dominantColor={book.cover?.dominantColor} size="md" />
          {attachState.isLoading && (
            <span className="absolute inset-0 flex items-center justify-center rounded-sm bg-surface/70">
              <Spinner label="Saving cover" />
            </span>
          )}
        </div>
        <FileDrop
          className="flex-1"
          accept={IMAGE_TYPES}
          title={book.cover ? "Replace the cover" : "Upload the cover"}
          hint="JPG, PNG or WebP, at least 1200×1800px. You'll frame it as a 2:3 book front next."
          onFile={(file) => void choose(file)}
          progress={progress}
          progressLabel="Uploading cover"
          onCancel={cancel}
          disabled={attachState.isLoading}
        />
      </div>

      <Modal
        open={pending !== null}
        onClose={() => setPending(null)}
        title="Frame the cover"
        description="Move and zoom until the front of the book fills the frame."
        size="lg"
        footer={
          <>
            <Button variant="ghost" onClick={() => setPending(null)}>
              Cancel
            </Button>
            <Button onClick={() => void confirm()}>Use this cover</Button>
          </>
        }
      >
        {pending && (
          <div className="flex flex-col gap-5">
            <CoverCropper src={pending.url} width={pending.width} height={pending.height} value={crop} onChange={setCrop} />
            <FormField label="Describe the cover (optional)" hint={`For screen-reader users. Defaults to "${book.title}".`}>
              <Input value={alt} onChange={(event) => setAlt(event.target.value)} maxLength={200} />
            </FormField>
            <p className="text-xs text-text-subtle">
              {pending.file.name} · {formatBytes(pending.file.size)}
            </p>
          </div>
        )}
      </Modal>
    </div>
  );
}

function GalleryPanel({ book }: { book: AdminBook }) {
  const { upload, cancel, progress } = useUpload("gallery", book.id);
  const [add] = useAddGalleryImageMutation();
  const [remove, removeState] = useRemoveGalleryImageMutation();
  const [removing, setRemoving] = useState<string | null>(null);
  const { toast } = useToast();
  const full = book.gallery.length >= MAX_GALLERY;

  const choose = async (file: File) => {
    try {
      const asset = await upload(file);
      if (!asset) return;
      await add({ id: book.id, publicId: asset.public_id }).unwrap();
      toast({ title: "Sample page added", tone: "success" });
    } catch (error) {
      toast({ title: "The image wasn't added", description: errorMessage(error, (error as Error).message), tone: "danger" });
    }
  };

  return (
    <div className="flex flex-col gap-4 border-t border-border pt-5">
      <div className="flex items-baseline justify-between gap-3">
        <h3 className="text-lg font-medium">Sample pages</h3>
        <span className="text-sm text-text-muted tabular-nums">
          {book.gallery.length} / {MAX_GALLERY}
        </span>
      </div>
      {book.gallery.length > 0 && (
        <ul className="grid grid-cols-3 gap-3 sm:grid-cols-4">
          {book.gallery.map((image, index) => (
            <li key={image.publicId} className="relative aspect-[3/4] overflow-hidden rounded-lg border border-border bg-surface-sunken">
              {image.src && <Image src={image.src} alt={image.alt || `Sample page ${index + 1}`} fill sizes="160px" className="object-cover" />}
              <IconButton
                label={`Remove sample page ${index + 1}`}
                size="sm"
                variant="secondary"
                className="absolute top-1.5 right-1.5 shadow-sm"
                icon={<Icon icon={Trash2} size="sm" />}
                onClick={() => setRemoving(image.publicId)}
              />
            </li>
          ))}
        </ul>
      )}
      {!full && (
        <FileDrop
          accept={IMAGE_TYPES}
          title="Add a sample page"
          hint="A photo or scan of an inside page, at least 800px wide. Readers see these on the book page."
          onFile={(file) => void choose(file)}
          progress={progress}
          progressLabel="Uploading image"
          onCancel={cancel}
        />
      )}
      <ConfirmDialog
        open={removing !== null}
        onCancel={() => setRemoving(null)}
        onConfirm={() => {
          if (!removing) return;
          void remove({ id: book.id, publicId: removing })
            .unwrap()
            .then(() => toast({ title: "Sample page removed", tone: "success" }))
            .catch((error: unknown) => toast({ title: errorMessage(error), tone: "danger" }))
            .finally(() => setRemoving(null));
        }}
        title="Remove this sample page?"
        description="It disappears from the book page straight away."
        confirmLabel="Remove"
        tone="danger"
        isConfirming={removeState.isLoading}
      />
    </div>
  );
}
