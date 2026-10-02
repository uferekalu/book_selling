/**
 * Direct browser uploads using short-lived signatures from our API (docs/ARCHITECTURE.md §10.0);
 * files never pass through our servers.
 * - Images → Cloudinary (`uploadFile`), in chunks when large.
 * - Book PDFs → private Cloudflare R2 storage (`uploadInParts`), in 8 MB pieces sent in parallel,
 *   so a dropped connection costs one piece, not the whole upload.
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

// ---------------------------------------------------------------- book PDFs (private R2 storage)

export interface PartsUploadStart {
  key: string;
  uploadId: string;
  partBytes: number;
  partCount: number;
}

/** Our API's side of a book PDF upload (POST /admin/catalog/books/:id/manuscript-uploads…). */
export interface PartsUploadApi {
  start: (bytes: number) => Promise<PartsUploadStart>;
  sign: (partNumbers: number[]) => Promise<Array<{ partNumber: number; url: string }>>;
  complete: () => Promise<{ key: string }>;
  abort: () => Promise<void>;
}

/** One XHR PUT of a piece straight to storage (fetch has no upload progress). Exported for tests to replace. */
export type PartSender = (url: string, body: Blob, onProgress: (loaded: number) => void, signal: AbortSignal) => Promise<{ status: number }>;

export const xhrPut: PartSender = (url, body, onProgress, signal) =>
  new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", url);
    xhr.upload.onprogress = (event) => onProgress(event.loaded);
    xhr.onload = () => resolve({ status: xhr.status });
    xhr.onerror = () => reject(new UploadError("The connection dropped during the upload.", "network"));
    xhr.onabort = () => reject(new UploadError("Upload cancelled.", "aborted"));
    if (signal.aborted) return reject(new UploadError("Upload cancelled.", "aborted"));
    signal.addEventListener("abort", () => xhr.abort(), { once: true });
    xhr.send(body);
  });

/** Signed piece URLs are valid for an hour; fresh ones are fetched well before that. */
export const PART_URL_LIFETIME_MS = 50 * 60 * 1000;
const PART_ATTEMPTS = 4;
const SIGN_BATCH = 20;

export interface PartsUploadOptions {
  file: File;
  api: PartsUploadApi;
  /** 0–1 across the whole file. */
  onProgress?: (fraction: number) => void;
  signal?: AbortSignal;
  put?: PartSender;
  /** Pieces in flight at once. */
  concurrency?: number;
  retryDelayMs?: number;
  now?: () => number;
}

/**
 * Uploads a book PDF straight to private storage in 8 MB pieces, three at a time
 * (ARCHITECTURE §10.0). A dropped piece is retried on its own; an expired link is replaced. If
 * anything fails for good, or the editor cancels, the upload is cancelled on the server too.
 * Returns the storage key to attach.
 */
export async function uploadInParts({
  file,
  api,
  onProgress,
  signal,
  put = xhrPut,
  concurrency = 3,
  retryDelayMs = 1500,
  now = Date.now,
}: PartsUploadOptions): Promise<string> {
  const extension = file.name.split(".").pop()?.toLowerCase() ?? "";
  if (extension !== "pdf") throw new UploadError("Please choose a PDF file.", "wrong_format");
  if (signal?.aborted) throw new UploadError("Upload cancelled.", "aborted");

  const started = await api.start(file.size);
  // Stops the other pieces as soon as one fails for good (or the editor cancels).
  const stop = new AbortController();
  const onCancel = () => stop.abort();
  signal?.addEventListener("abort", onCancel, { once: true });

  const loaded = new Map<number, number>();
  const report = () => {
    let sum = 0;
    for (const bytes of loaded.values()) sum += bytes;
    onProgress?.(Math.min(1, sum / Math.max(1, file.size)));
  };
  const queue = Array.from({ length: started.partCount }, (_, i) => i + 1);

  const urls = new Map<number, { url: string; signedAt: number }>();
  // Pieces whose links are being fetched right now, so parallel workers share one request.
  const signing = new Map<number, Promise<void>>();
  const isFresh = (n: number) => {
    const cached = urls.get(n);
    return cached !== undefined && now() - cached.signedAt < PART_URL_LIFETIME_MS;
  };
  const urlFor = async (partNumber: number): Promise<string> => {
    if (!isFresh(partNumber)) {
      let pending = signing.get(partNumber);
      if (!pending) {
        // Sign this piece and the next few waiting ones in one request.
        const batch = [partNumber, ...queue.filter((n) => !isFresh(n) && !signing.has(n)).slice(0, SIGN_BATCH - 1)];
        const signedAt = now();
        pending = api.sign(batch).then((signed) => {
          for (const { partNumber: n, url } of signed) urls.set(n, { url, signedAt });
        });
        for (const n of batch) signing.set(n, pending);
        void pending.finally(() => batch.forEach((n) => signing.delete(n))).catch(() => undefined);
      }
      await pending;
    }
    const url = urls.get(partNumber)?.url;
    if (!url) throw new UploadError("The upload could not be authorised. Please try again.", "rejected");
    return url;
  };

  const sendPart = async (partNumber: number) => {
    const from = (partNumber - 1) * started.partBytes;
    const body = file.slice(from, Math.min(from + started.partBytes, file.size));
    for (let attempt = 1; ; attempt += 1) {
      if (stop.signal.aborted) throw new UploadError("Upload cancelled.", "aborted");
      let status: number;
      try {
        const url = await urlFor(partNumber);
        const onPartProgress = (bytes: number) => {
          loaded.set(partNumber, bytes);
          report();
        };
        status = (await put(url, body, onPartProgress, stop.signal)).status;
      } catch (error) {
        if (error instanceof UploadError && (error.kind === "aborted" || error.kind === "rejected")) throw error;
        if (attempt >= PART_ATTEMPTS) throw error;
        loaded.set(partNumber, 0);
        await wait(retryDelayMs * attempt, stop.signal);
        continue;
      }
      if (status >= 200 && status < 300) {
        loaded.set(partNumber, body.size);
        report();
        return;
      }
      loaded.set(partNumber, 0);
      // 403: the link expired (a long upload, or a laptop that slept). Get a new one and retry.
      if (status === 403) urls.delete(partNumber);
      else if (status < 500) throw new UploadError(`Storage refused the file (${status}).`, "rejected");
      if (attempt >= PART_ATTEMPTS) throw new UploadError(`The upload kept failing (${status}). Please try again.`, "network");
      await wait(retryDelayMs * attempt, stop.signal);
    }
  };

  try {
    const worker = async () => {
      for (let next = queue.shift(); next !== undefined; next = queue.shift()) await sendPart(next);
    };
    const workers = Array.from({ length: Math.min(concurrency, started.partCount) }, worker);
    await Promise.all(
      workers.map((running) =>
        running.catch((error: unknown) => {
          stop.abort();
          throw error;
        }),
      ),
    );
    return (await api.complete()).key;
  } catch (error) {
    stop.abort();
    void api.abort().catch(() => undefined);
    if (signal?.aborted) throw new UploadError("Upload cancelled.", "aborted");
    throw error;
  } finally {
    signal?.removeEventListener("abort", onCancel);
  }
}
