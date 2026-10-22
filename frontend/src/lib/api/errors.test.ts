import { describe, expect, it } from "vitest";
import { SERVER_BEHIND, errorMessage } from "./errors";

const api = (status: number, message: unknown) => ({ status, data: { statusCode: status, message } });

describe("error messages (BS-35)", () => {
  it("explains a server that is older than the website instead of showing its raw words", () => {
    expect(errorMessage(api(400, ["property kind should not exist"]))).toBe(SERVER_BEHIND);
    expect(errorMessage(api(404, "Cannot GET /admin/papers"))).toBe(SERVER_BEHIND);
  });

  it("keeps the API's own sentences, which are already written for people", () => {
    expect(errorMessage(api(400, "That ISBN-13 is not valid. Check the digits (978… or 979…)."))).toBe(
      "That ISBN-13 is not valid. Check the digits (978… or 979…).",
    );
  });

  it("explains an unreachable or restarting server", () => {
    expect(errorMessage({ status: "FETCH_ERROR", error: "x" })).toMatch(/couldn't reach the server/);
    expect(errorMessage(api(503, "Service Unavailable"))).toMatch(/isn't answering right now/);
    expect(errorMessage(api(500, "Internal server error"))).toBe("Something went wrong. Please try again.");
  });
});
