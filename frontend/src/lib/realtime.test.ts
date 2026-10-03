import { describe, expect, it } from "vitest";
import { tokenExpiry, tokenIsFresh } from "./realtime";

const jwt = (payload: object) => `h.${btoa(JSON.stringify(payload)).replace(/=+$/, "").replace(/\+/g, "-").replace(/\//g, "_")}.s`;

describe("token expiry (socket reconnects)", () => {
  it("reads exp from an access token", () => {
    expect(tokenExpiry(jwt({ sub: "u1", exp: 1_900_000_000 }))).toBe(1_900_000_000);
    expect(tokenExpiry(null)).toBeNull();
    expect(tokenExpiry("garbage")).toBeNull();
    expect(tokenExpiry("a.%%%.b")).toBeNull();
    expect(tokenExpiry(jwt({ sub: "u1" }))).toBeNull();
  });

  it("treats a token about to expire as stale, so the session is renewed first", () => {
    const now = 1_000_000_000_000;
    expect(tokenIsFresh(jwt({ exp: now / 1000 + 600 }), now)).toBe(true);
    expect(tokenIsFresh(jwt({ exp: now / 1000 + 10 }), now)).toBe(false);
    expect(tokenIsFresh(jwt({ exp: now / 1000 - 10 }), now)).toBe(false);
    expect(tokenIsFresh(null, now)).toBe(false);
  });
});
