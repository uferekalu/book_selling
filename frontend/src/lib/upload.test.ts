import { describe, expect, it, vi } from "vitest";
import {
  chunkRanges,
  formatBytes,
  PART_URL_LIFETIME_MS,
  precheck,
  TICKET_LIFETIME_MS,
  uploadFile,
  UploadError,
  uploadInParts,
  type PartSender,
  type PartsUploadApi,
  type Sender,
  type UploadTicket,
} from "./upload";

const MB = 1024 * 1024;

function ticket(overrides: Partial<UploadTicket> = {}): UploadTicket {
  return {
    uploadUrl: "https://api.cloudinary.com/v1_1/demo/image/upload",
    fields: { timestamp: "1", signature: "sig", api_key: "k", folder: "f" },
    maxBytes: 20 * MB,
    chunkBytes: 6 * MB,
    allowedFormats: ["pdf"],
    ...overrides,
  };
}

const file = (bytes: number, name = "book.pdf") => new File([new Uint8Array(bytes)], name);

describe("chunkRanges", () => {
  it("covers the file exactly, inclusive ends", () => {
    expect(chunkRanges(10, 4)).toEqual([
      [0, 3],
      [4, 7],
      [8, 9],
    ]);
    expect(chunkRanges(8, 4)).toEqual([
      [0, 3],
      [4, 7],
    ]);
    expect(chunkRanges(0, 4)).toEqual([]);
  });
});

describe("precheck", () => {
  it("rejects the wrong format and an oversized file with a helpful message", () => {
    expect(() => precheck(file(10, "cover.png"), ticket())).toThrow(/PDF/);
    expect(() => precheck(file(21 * MB), ticket())).toThrow(/21 MB.*20 MB/);
  });

  it("treats .jpeg as jpg", () => {
    expect(() => precheck(file(10, "a.JPEG"), ticket({ allowedFormats: ["jpg"] }))).not.toThrow();
  });
});

describe("formatBytes", () => {
  it.each([
    [512, "512 B"],
    [2048, "2 KB"],
    [1.5 * MB, "1.5 MB"],
    [120 * MB, "120 MB"],
  ])("%s → %s", (bytes, text) => expect(formatBytes(bytes)).toBe(text));
});

describe("uploadFile", () => {
  const done = { status: 200, body: { public_id: "f/abc", bytes: 1, format: "pdf" } };

  it("sends a small file in one request without chunk headers", async () => {
    const send = vi.fn<Sender>().mockResolvedValue(done);
    const asset = await uploadFile({ file: file(1000), getTicket: async () => ticket(), send });
    expect(asset.public_id).toBe("f/abc");
    expect(send).toHaveBeenCalledTimes(1);
    expect(send.mock.calls[0][2]).toEqual({});
    expect((send.mock.calls[0][1] as FormData).get("signature")).toBe("sig");
  });

  it("chunks a large file with one upload id and correct ranges, reporting progress to 100%", async () => {
    const send = vi.fn<Sender>().mockResolvedValue(done);
    const progress: number[] = [];
    await uploadFile({ file: file(13 * MB), getTicket: async () => ticket(), send, onProgress: (f) => progress.push(f) });
    const headers = send.mock.calls.map((call) => call[2]);
    expect(headers.map((h) => h["Content-Range"])).toEqual([
      `bytes 0-${6 * MB - 1}/${13 * MB}`,
      `bytes ${6 * MB}-${12 * MB - 1}/${13 * MB}`,
      `bytes ${12 * MB}-${13 * MB - 1}/${13 * MB}`,
    ]);
    expect(new Set(headers.map((h) => h["X-Unique-Upload-Id"])).size).toBe(1);
    expect(progress.at(-1)).toBe(1);
  });

  it("retries a chunk after a dropped connection or a 5xx, then succeeds", async () => {
    const send = vi
      .fn<Sender>()
      .mockRejectedValueOnce(new UploadError("drop", "network"))
      .mockResolvedValueOnce({ status: 503, body: null })
      .mockResolvedValue(done);
    await expect(uploadFile({ file: file(100), getTicket: async () => ticket(), send, retryDelayMs: 0 })).resolves.toBeTruthy();
    expect(send).toHaveBeenCalledTimes(3);
  });

  it("does not retry a 4xx and surfaces Cloudinary's message", async () => {
    const send = vi.fn<Sender>().mockResolvedValue({ status: 400, body: { error: { message: "Invalid signature" } } });
    await expect(uploadFile({ file: file(100), getTicket: async () => ticket(), send, retryDelayMs: 0 })).rejects.toThrow(/Invalid signature/);
    expect(send).toHaveBeenCalledTimes(1);
  });

  it("gives up after three failed attempts", async () => {
    const send = vi.fn<Sender>().mockRejectedValue(new UploadError("drop", "network"));
    await expect(uploadFile({ file: file(100), getTicket: async () => ticket(), send, retryDelayMs: 0 })).rejects.toThrow(/drop/);
    expect(send).toHaveBeenCalledTimes(3);
  });

  it("re-signs before the signature expires on a long upload", async () => {
    let clock = 0;
    const getTicket = vi.fn(async () => ticket());
    const send = vi.fn<Sender>().mockImplementation(async () => {
      clock += TICKET_LIFETIME_MS / 2 + 1;
      return done;
    });
    await uploadFile({ file: file(13 * MB), getTicket, send, now: () => clock });
    expect(getTicket).toHaveBeenCalledTimes(2);
  });

  it("stops when cancelled", async () => {
    const controller = new AbortController();
    controller.abort();
    const send = vi.fn<Sender>();
    await expect(uploadFile({ file: file(100), getTicket: async () => ticket(), send, signal: controller.signal })).rejects.toMatchObject({
      kind: "aborted",
    });
    expect(send).not.toHaveBeenCalled();
  });

  it("refuses a success response without a public_id", async () => {
    const send = vi.fn<Sender>().mockResolvedValue({ status: 200, body: {} });
    await expect(uploadFile({ file: file(100), getTicket: async () => ticket(), send })).rejects.toThrow(/did not confirm/);
  });
});

describe("uploadInParts (book PDFs to private storage)", () => {
  const started = { key: "root/books/b/manuscript/k.pdf", uploadId: "up-1", partBytes: 8, partCount: 3 };

  function fakeApi() {
    let signing = 0;
    return {
      start: vi.fn<PartsUploadApi["start"]>().mockResolvedValue(started),
      sign: vi.fn<PartsUploadApi["sign"]>().mockImplementation(async (numbers) => {
        signing += 1;
        return numbers.map((partNumber) => ({ partNumber, url: `https://r2.test/part-${partNumber}?sig=${signing}` }));
      }),
      complete: vi.fn<PartsUploadApi["complete"]>().mockResolvedValue({ key: started.key }),
      abort: vi.fn<PartsUploadApi["abort"]>().mockResolvedValue(undefined),
    };
  }

  const ok: PartSender = async (_url, body, onProgress) => {
    onProgress(body.size);
    return { status: 200 };
  };

  it("sends every 8-byte piece once, signs them in one shared request, completes and reports progress", async () => {
    const api = fakeApi();
    const sent: Array<[string, number]> = [];
    const progress: number[] = [];
    const key = await uploadInParts({
      file: file(20),
      api,
      put: async (url, body, onProgress, signal) => {
        sent.push([url.split("?")[0], body.size]);
        return ok(url, body, onProgress, signal);
      },
      onProgress: (fraction) => progress.push(fraction),
    });
    expect(key).toBe(started.key);
    expect(api.start).toHaveBeenCalledWith(20);
    // Three pieces start at once, but share one signing request.
    expect(api.sign).toHaveBeenCalledTimes(1);
    expect(sent.sort()).toEqual([
      ["https://r2.test/part-1", 8],
      ["https://r2.test/part-2", 8],
      ["https://r2.test/part-3", 4],
    ]);
    expect(api.complete).toHaveBeenCalledTimes(1);
    expect(api.abort).not.toHaveBeenCalled();
    expect(progress.at(-1)).toBe(1);
  });

  it("retries a dropped piece on its own", async () => {
    const api = fakeApi();
    const attempts = new Map<string, number>();
    const key = await uploadInParts({
      file: file(20),
      api,
      retryDelayMs: 0,
      put: async (url, body, onProgress, signal) => {
        const part = url.split("?")[0];
        attempts.set(part, (attempts.get(part) ?? 0) + 1);
        if (part.endsWith("part-2") && attempts.get(part) === 1) throw new UploadError("dropped", "network");
        return ok(url, body, onProgress, signal);
      },
    });
    expect(key).toBe(started.key);
    expect(attempts.get("https://r2.test/part-2")).toBe(2);
    expect(attempts.get("https://r2.test/part-1")).toBe(1);
  });

  it("gets a fresh link after a 403 (expired signature) and once the link lifetime has passed", async () => {
    const api = fakeApi();
    const urls: string[] = [];
    let clock = 0;
    await uploadInParts({
      file: file(20),
      api,
      concurrency: 1,
      retryDelayMs: 0,
      now: () => clock,
      put: async (url, body, onProgress, signal) => {
        urls.push(url);
        if (url === "https://r2.test/part-1?sig=1") return { status: 403 };
        // Pretend the editor's laptop slept for an hour after piece 2.
        if (url.includes("part-2")) clock += PART_URL_LIFETIME_MS + 1;
        return ok(url, body, onProgress, signal);
      },
    });
    // Piece 1 is re-signed alone; piece 2 still had a valid link; piece 3's had expired.
    expect(urls).toEqual([
      "https://r2.test/part-1?sig=1",
      "https://r2.test/part-1?sig=2",
      "https://r2.test/part-2?sig=1",
      "https://r2.test/part-3?sig=3",
    ]);
  });

  it("stops and cancels the upload on the server when storage refuses a piece", async () => {
    const api = fakeApi();
    await expect(uploadInParts({ file: file(20), api, retryDelayMs: 0, put: async () => ({ status: 400 }) })).rejects.toMatchObject({
      kind: "rejected",
    });
    expect(api.complete).not.toHaveBeenCalled();
    expect(api.abort).toHaveBeenCalledTimes(1);
  });

  it("cancels cleanly when the editor cancels", async () => {
    const api = fakeApi();
    const controller = new AbortController();
    const upload = uploadInParts({
      file: file(20),
      api,
      signal: controller.signal,
      put: (_url, _body, _progress, signal) =>
        new Promise((_resolve, reject) => {
          signal.addEventListener("abort", () => reject(new UploadError("Upload cancelled.", "aborted")));
          controller.abort();
        }),
    });
    await expect(upload).rejects.toMatchObject({ kind: "aborted" });
    expect(api.abort).toHaveBeenCalledTimes(1);
    expect(api.complete).not.toHaveBeenCalled();
  });

  it("refuses a file that isn't a PDF before contacting the server", async () => {
    const api = fakeApi();
    await expect(uploadInParts({ file: file(20, "book.docx"), api })).rejects.toMatchObject({ kind: "wrong_format" });
    expect(api.start).not.toHaveBeenCalled();
  });
});
