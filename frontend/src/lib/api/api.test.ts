import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { makeStore } from "@/lib/redux/store";
import { api } from "./api";

// fetchBaseQuery builds `new Request("/api/...")`; Node's Request needs an absolute URL.
const NativeRequest = globalThis.Request;
class RelativeRequest extends NativeRequest {
  constructor(input: RequestInfo | URL, init?: RequestInit) {
    super(typeof input === "string" ? new URL(input, "http://localhost").href : input, init);
  }
}

const testApi = api.injectEndpoints({
  endpoints: (builder) => ({
    ping: builder.query<{ ok: boolean }, number>({ query: (n) => `/ping/${n}` }),
    badLogin: builder.mutation<unknown, void>({ query: () => ({ url: "/auth/login", method: "POST", body: {} }) }),
  }),
});

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

const session = (token: string) => ({
  status: "authenticated",
  accessToken: token,
  user: { id: "u1", email: "ada@example.com", name: "Ada", role: "customer" },
});

let fetchMock: ReturnType<typeof vi.fn>;
const calls = (path: string) => fetchMock.mock.calls.filter(([req]) => new URL((req as Request).url).pathname === path).length;

beforeEach(() => {
  vi.stubGlobal("Request", RelativeRequest);
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function storeWithToken(token: string | null) {
  return makeStore({
    session: { user: null, accessToken: token, status: token ? "authenticated" : "anonymous" },
  });
}

describe("baseQueryWithReauth", () => {
  it("renews an expired access token once and retries the request with the new token", async () => {
    fetchMock.mockImplementation(async (req: Request) => {
      const path = new URL(req.url).pathname;
      if (path === "/api/auth/refresh") return json(200, session("fresh"));
      return req.headers.get("Authorization") === "Bearer fresh" ? json(200, { ok: true }) : json(401, { message: "expired" });
    });
    const store = storeWithToken("stale");
    const result = await store.dispatch(testApi.endpoints.ping.initiate(1));
    expect(result.data).toEqual({ ok: true });
    expect(store.getState().session.accessToken).toBe("fresh");
    expect(calls("/api/auth/refresh")).toBe(1);
  });

  it("shares one renewal between concurrent 401s (the refresh token is single-use)", async () => {
    fetchMock.mockImplementation(async (req: Request) => {
      const path = new URL(req.url).pathname;
      if (path === "/api/auth/refresh") {
        await new Promise((r) => setTimeout(r, 20));
        return json(200, session("fresh"));
      }
      return req.headers.get("Authorization") === "Bearer fresh" ? json(200, { ok: true }) : json(401, {});
    });
    const store = storeWithToken("stale");
    const results = await Promise.all([1, 2, 3, 4, 5].map((n) => store.dispatch(testApi.endpoints.ping.initiate(n))));
    expect(results.every((r) => r.data?.ok)).toBe(true);
    expect(calls("/api/auth/refresh")).toBe(1);
  });

  it("signs out cleanly when renewal fails, without retrying", async () => {
    fetchMock.mockImplementation(async () => json(401, { message: "Your session has ended" }));
    const store = storeWithToken("stale");
    const result = await store.dispatch(testApi.endpoints.ping.initiate(1));
    expect(result.error).toMatchObject({ status: 401 });
    expect(store.getState().session).toMatchObject({ status: "anonymous", accessToken: null });
    expect(calls("/api/ping/1")).toBe(1);
  });

  it("treats an anonymous reply from refresh as signed out, not as an error", async () => {
    fetchMock.mockImplementation(async (req: Request) =>
      new URL(req.url).pathname === "/api/auth/refresh" ? json(200, { status: "anonymous" }) : json(401, {}),
    );
    const store = storeWithToken("stale");
    await store.dispatch(testApi.endpoints.ping.initiate(1));
    expect(store.getState().session.status).toBe("anonymous");
    expect(calls("/api/ping/1")).toBe(1);
  });

  it("never treats a failed sign-in as an expired session", async () => {
    fetchMock.mockImplementation(async () => json(401, { message: "Incorrect email or password" }));
    const store = storeWithToken(null);
    await store.dispatch(testApi.endpoints.badLogin.initiate());
    expect(calls("/api/auth/refresh")).toBe(0);
  });
});
