/**
 * Direct browser → Cloudinary uploads using a short-lived signature from our API
 * (docs/ARCHITECTURE.md §10.0). The file never passes through our servers. Large files (book PDFs)
 * go up in chunks, so a dropped connection costs one chunk, not the whole upload.
 */

export interface UploadTicket {
  uploadUrl: string;
  fields: Record<string, string>;
  maxBytes: number;
  chunkBytes: number;
  allowedFormats: string[];
}

export interface UploadedAsset {
  public_id: string;
  bytes: number;
  format: string;
  width?: number;
  height?: number;
  pages?: number;
}

export class UploadError extends Error {
  constructor(
    message: string,
    readonly kind: "too_large" | "wrong_format" | "rejected" | "network" | "aborted",
  ) {
    super(message);
    this.name = "UploadError";
  }
}

/** Cloudinary signatures expire after an hour; a fresh one is fetched well before that. */
export const TICKET_LIFETIME_MS = 50 * 60 * 1000;
const RETRIES_PER_CHUNK = 3;

/** Inclusive byte ranges [start, end] covering `size` in pieces of at most `chunkBytes`. */
export function chunkRanges(size: number, chunkBytes: number): Array<[number, number]> {
  if (size <= 0) return [];
  const ranges: Array<[number, number]> = [];
  for (let start = 0; start < size; start += chunkBytes) ranges.push([start, Math.min(start + chunkBytes, size) - 1]);
  return ranges;
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  const mb = bytes / (1024 * 1024);
  return `${mb < 10 ? mb.toFixed(1) : Math.round(mb)} MB`;
}

/** Client-side checks so obvious mistakes fail instantly; the API re-verifies every upload. */
export function precheck(file: File, ticket: Pick<UploadTicket, "maxBytes" | "allowedFormats">): void {
  const extension = file.name.split(".").pop()?.toLowerCase() ?? "";
  const normalised = extension === "jpeg" ? "jpg" : extension;
  if (!ticket.allowedFormats.includes(normalised)) {
    throw new UploadError(`Please choose a ${ticket.allowedFormats.join(", ").toUpperCase()} file.`, "wrong_format");
  }
  if (file.size > ticket.maxBytes) {
    throw new UploadError(
      `That file is ${formatBytes(file.size)}; the limit is ${formatBytes(ticket.maxBytes)}.`,
      "too_large",
    );
  }
}

interface SendResult {
  status: number;
  body: unknown;
}

/** One XHR (fetch has no upload progress). Exported for tests to replace. */
export type Sender = (
  url: string,
  form: FormData,
  headers: Record<string, string>,
  onProgress: (loaded: number) => void,
  signal?: AbortSignal,
) => Promise<SendResult>;

export const xhrSender: Sender = (url, form, headers, onProgress, signal) =>
  new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", url);
    for (const [name, value] of Object.entries(headers)) xhr.setRequestHeader(name, value);
    xhr.upload.onprogress = (event) => onProgress(event.loaded);
    xhr.onload = () => {
      let body: unknown = null;
      try {
        body = JSON.parse(xhr.responseText);
      } catch {
        body = null;
      }
      resolve({ status: xhr.status, body });
    };
    xhr.onerror = () => reject(new UploadError("The connection dropped during the upload.", "network"));
    xhr.onabort = () => reject(new UploadError("Upload cancelled.", "aborted"));
    if (signal) {
      if (signal.aborted) return reject(new UploadError("Upload cancelled.", "aborted"));
      signal.addEventListener("abort", () => xhr.abort(), { once: true });
    }
    xhr.send(form);
  });

const wait = (ms: number, signal?: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener(
      "abort",
      () => {
        clearTimeout(timer);
        reject(new UploadError("Upload cancelled.", "aborted"));
      },
      { once: true },
    );
  });

function newUploadId(): string {
  const bytes = new Uint8Array(12);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

export interface UploadOptions {
  file: File;
  /** Fetches a signed ticket from POST /uploads/signature. Called again for long uploads. */
  getTicket: () => Promise<UploadTicket>;
  /** 0–1 across the whole file. */
  onProgress?: (fraction: number) => void;
  signal?: AbortSignal;
  send?: Sender;
  now?: () => number;
  retryDelayMs?: number;
}

/** Uploads `file` and returns Cloudinary's description of the stored asset. */
export async function uploadFile({
  file,
  getTicket,
  onProgress,
  signal,
  send = xhrSender,
  now = Date.now,
  retryDelayMs = 1500,
}: UploadOptions): Promise<UploadedAsset> {
  let ticket = await getTicket();
  let issuedAt = now();
  precheck(file, ticket);

  const ranges = chunkRanges(file.size, ticket.chunkBytes);
  const chunked = ranges.length > 1;
  const uploadId = newUploadId();
  let doneBytes = 0;
  let last: SendResult | null = null;

  for (const [start, end] of ranges) {
    for (let attempt = 1; ; attempt += 1) {
      if (signal?.aborted) throw new UploadError("Upload cancelled.", "aborted");
      if (now() - issuedAt > TICKET_LIFETIME_MS) {
        ticket = await getTicket();
        issuedAt = now();
      }
      const form = new FormData();
      for (const [name, value] of Object.entries(ticket.fields)) form.append(name, value);
      form.append("file", chunked ? file.slice(start, end + 1) : file, file.name);
      const headers: Record<string, string> = chunked
        ? { "X-Unique-Upload-Id": uploadId, "Content-Range": `bytes ${start}-${end}/${file.size}` }
        : {};

      try {
        last = await send(ticket.uploadUrl, form, headers, (loaded) => onProgress?.(Math.min(1, (doneBytes + loaded) / file.size)), signal);
      } catch (error) {
        if (error instanceof UploadError && error.kind === "aborted") throw error;
        if (attempt >= RETRIES_PER_CHUNK) throw error;
        await wait(retryDelayMs * attempt, signal);
        continue;
      }

      if (last.status >= 200 && last.status < 300) break;
      const message = (last.body as { error?: { message?: string } } | null)?.error?.message;
      // 4xx is a definite "no" (bad format, size, signature); only server errors are retried.
      if (last.status < 500 || attempt >= RETRIES_PER_CHUNK) {
        throw new UploadError(message ? `Cloudinary refused the file: ${message}` : `Upload failed (${last.status}).`, "rejected");
      }
      await wait(retryDelayMs * attempt, signal);
    }
    doneBytes = end + 1;
    onProgress?.(doneBytes / file.size);
  }

  const asset = last?.body as UploadedAsset | null;
  if (!asset?.public_id) throw new UploadError("Cloudinary did not confirm the upload.", "rejected");
  return asset;
}
