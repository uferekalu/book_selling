import { describe, expect, it, vi } from "vitest";
import { chunkRanges, formatBytes, precheck, TICKET_LIFETIME_MS, uploadFile, UploadError, type Sender, type UploadTicket } from "./upload";

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
