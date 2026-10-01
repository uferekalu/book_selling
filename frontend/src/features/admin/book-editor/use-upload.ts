"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useUploadSignatureMutation, type UploadKind } from "@/lib/api/catalog-admin-api";
import { uploadFile, UploadError, type UploadedAsset } from "@/lib/upload";

/** Signed upload with progress and cancel, for one owner (book or author) and kind. */
export function useUpload(kind: UploadKind, ownerId: string) {
  const [sign] = useUploadSignatureMutation();
  const [progress, setProgress] = useState<number | undefined>(undefined);
  const controller = useRef<AbortController | null>(null);

  useEffect(() => () => controller.current?.abort(), []);

  const upload = useCallback(
    async (file: File): Promise<UploadedAsset | null> => {
      controller.current?.abort();
      const abort = new AbortController();
      controller.current = abort;
      setProgress(0);
      try {
        return await uploadFile({
          file,
          getTicket: () => sign({ kind, ownerId }).unwrap(),
          onProgress: setProgress,
          signal: abort.signal,
        });
      } catch (error) {
        if (error instanceof UploadError && error.kind === "aborted") return null;
        throw error;
      } finally {
        if (controller.current === abort) controller.current = null;
        setProgress(undefined);
      }
    },
    [kind, ownerId, sign],
  );

  const cancel = useCallback(() => controller.current?.abort(), []);
  return { upload, cancel, progress, uploading: progress !== undefined };
}
