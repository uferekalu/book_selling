import { describe, expect, it } from "vitest";
import { getBackendUrl } from "./backend-url";

const env = (vars: Record<string, string>) => vars as unknown as NodeJS.ProcessEnv;

describe("getBackendUrl", () => {
  it("uses API_URL and strips trailing slashes", () => {
    expect(getBackendUrl(env({ API_URL: "https://api.example.com//" }))).toBe(
      "https://api.example.com",
    );
  });

  it("falls back to the local API in development", () => {
    expect(getBackendUrl(env({ NODE_ENV: "development" }))).toBe("http://localhost:4000");
  });

  it("allows the fallback for a CI production build check", () => {
    expect(getBackendUrl(env({ NODE_ENV: "production", CI: "true" }))).toBe(
      "http://localhost:4000",
    );
  });

  it("refuses to fall back in a real production build", () => {
    expect(() => getBackendUrl(env({ NODE_ENV: "production" }))).toThrow(/API_URL/);
  });
});
