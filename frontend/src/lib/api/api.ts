import { createApi, fetchBaseQuery, type BaseQueryFn, type FetchArgs, type FetchBaseQueryError } from "@reduxjs/toolkit/query/react";
import { Mutex } from "async-mutex";
import { sessionEnded, sessionStarted } from "@/lib/redux/slices/session-slice";
import type { SessionResponse } from "./types";

/** Paths where a 401 means "not signed in / wrong credentials", never "access token expired". */
const NO_REAUTH_PATHS = new Set(["/auth/login", "/auth/login/2fa", "/auth/register", "/auth/refresh", "/auth/logout"]);

const urlOf = (args: string | FetchArgs) => (typeof args === "string" ? args : args.url);

const rawBaseQuery = fetchBaseQuery({
  // Same-origin proxy (next.config.ts rewrites /api/* to the API), so the refresh cookie is
  // first-party in every browser (docs/ARCHITECTURE.md §5).
  baseUrl: "/api",
  credentials: "same-origin",
  prepareHeaders: (headers, { getState }) => {
    const token = (getState() as { session: { accessToken: string | null } }).session.accessToken;
    if (token) headers.set("Authorization", `Bearer ${token}`);
    return headers;
  },
});

/**
 * Serialises every call to /auth/refresh in this tab. The refresh token is single-use; two
 * parallel refreshes from one tab would race it. Exported because `SessionBootstrap`'s on-load
 * refresh must hold the same lock. In the reference project a page whose first query 401'd
 * while the bootstrap refresh was in flight fired a second refresh and logged the user out.
 */
export const refreshMutex = new Mutex();

/**
 * Asks the API for a fresh session from the httpOnly cookie. The CALLER must hold `refreshMutex`.
 * It goes through the raw base query, not `baseQueryWithReauth`: routing it through the wrapper
 * would wait on the very lock its caller holds, a self-deadlock the reference project shipped.
 */
export async function renewSession(api: Parameters<BaseQueryFn>[1], extraOptions: object = {}): Promise<boolean> {
  const result = await rawBaseQuery({ url: "/auth/refresh", method: "POST" }, api, extraOptions);
  // A visitor with no session gets 200 { status: "anonymous" }, not an error.
  const data = result.data as SessionResponse | { status: "anonymous" } | undefined;
  if (data?.status === "authenticated") {
    api.dispatch(sessionStarted({ user: data.user, accessToken: data.accessToken }));
    return true;
  }
  api.dispatch(sessionEnded());
  return false;
}

/**
 * Access tokens last 15 minutes. On a 401 from any normal endpoint, renew once through the cookie
 * and retry, so expiry is invisible to the user. Concurrent 401s share one renewal.
 */
export const baseQueryWithReauth: BaseQueryFn<string | FetchArgs, unknown, FetchBaseQueryError> = async (
  args,
  api,
  extraOptions,
) => {
  await refreshMutex.waitForUnlock();
  let result = await rawBaseQuery(args, api, extraOptions);
  if (result.error?.status !== 401 || NO_REAUTH_PATHS.has(urlOf(args))) return result;

  if (refreshMutex.isLocked()) {
    await refreshMutex.waitForUnlock();
  } else {
    const release = await refreshMutex.acquire();
    try {
      await renewSession(api, extraOptions);
    } finally {
      release();
    }
  }
  const signedIn = (api.getState() as { session: { status: string } }).session.status === "authenticated";
  if (signedIn) result = await rawBaseQuery(args, api, extraOptions);
  return result;
};

/** The single RTK Query instance; features add endpoints with `api.injectEndpoints()`. */
export const api = createApi({
  reducerPath: "api",
  baseQuery: baseQueryWithReauth,
  tagTypes: ["Me", "Addresses", "Sessions"],
  endpoints: () => ({}),
});
