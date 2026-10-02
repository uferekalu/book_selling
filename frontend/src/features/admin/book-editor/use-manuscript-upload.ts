"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  useAbortManuscriptUploadMutation,
  useCompleteManuscriptUploadMutation,
  useSignManuscriptPartsMutation,
  useStartManuscriptUploadMutation,
  type ManuscriptUploadRef,
} from "@/lib/api/catalog-admin-api";
import { UploadError, uploadInParts } from "@/lib/upload";

/** A book PDF upload to private storage, with progress and cancel. Resolves to the key to attach. */
export function useManuscriptUpload(bookId: string) {
  const [start] = useStartManuscriptUploadMutation();
  const [sign] = useSignManuscriptPartsMutation();
  const [complete] = useCompleteManuscriptUploadMutation();
  const [abort] = useAbortManuscriptUploadMutation();
  const [progress, setProgress] = useState<number | undefined>(undefined);
  const controller = useRef<AbortController | null>(null);

  useEffect(() => () => controller.current?.abort(), []);

  const upload = useCallback(
    async (file: File): Promise<string | null> => {
      controller.current?.abort();
      const cancel = new AbortController();
      controller.current = cancel;
      setProgress(0);
      let ref: ManuscriptUploadRef | null = null;
      const current = () => {
        if (!ref) throw new UploadError("The upload has not started.", "rejected");
        return { id: bookId, ...ref };
      };
      try {
        return await uploadInParts({
          file,
          signal: cancel.signal,
          onProgress: setProgress,
          api: {
            start: async (bytes) => {
              const started = await start({ id: bookId, bytes }).unwrap();
              ref = { key: started.key, uploadId: started.uploadId };
              return started;
            },
            sign: async (partNumbers) => (await sign({ ...current(), partNumbers }).unwrap()).parts,
            complete: () => complete(current()).unwrap(),
            abort: async () => {
              if (ref) await abort(current()).unwrap();
            },
          },
        });
      } catch (error) {
        if (error instanceof UploadError && error.kind === "aborted") return null;
        throw error;
      } finally {
        if (controller.current === cancel) controller.current = null;
        setProgress(undefined);
      }
    },
    [bookId, start, sign, complete, abort],
  );

  const cancel = useCallback(() => controller.current?.abort(), []);
  return { upload, cancel, progress };
}
