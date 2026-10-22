import type { FetchBaseQueryError } from "@reduxjs/toolkit/query";
import type { SerializedError } from "@reduxjs/toolkit";
import type { ApiErrorBody } from "./types";

type QueryError = FetchBaseQueryError | SerializedError | undefined | unknown;

function body(error: QueryError): Partial<ApiErrorBody> | null {
  if (error && typeof error === "object" && "data" in error) {
    const data = (error as { data: unknown }).data;
    if (data && typeof data === "object") return data as Partial<ApiErrorBody>;
  }
  return null;
}

/** Shown when the website is newer than the server it talks to (a deploy still on its way). */
export const SERVER_BEHIND =
  "This part of the store was just updated, and the store's server hasn't caught up yet. It usually takes a few minutes: please try again shortly.";

/**
 * The API's own words, made readable (BS-35). Its validation layer speaks to developers
 * ("property kind should not exist" means the server doesn't know a field the website sent, so
 * the server is older than the website); people get a sentence they can act on instead.
 */
export function readableApiMessage(message: string): string {
  if (/^property \S+ should not exist$/i.test(message) || /^Cannot (GET|POST|PUT|PATCH|DELETE) \//.test(message)) return SERVER_BEHIND;
  return message;
}

/** A sentence a person can act on, from any RTK Query / fetch error. */
export function errorMessage(error: QueryError, fallback = "Something went wrong. Please try again."): string {
  if (error && typeof error === "object" && "status" in error) {
    const status = (error as FetchBaseQueryError).status;
    if (status === "FETCH_ERROR") return "We couldn't reach the server. Check your connection and try again.";
    if (status === 429 && !body(error)?.message) return "Too many attempts. Please wait a moment and try again.";
    if (status === 502 || status === 503 || status === 504) {
      return "The store's server isn't answering right now (it may be restarting). Please try again in a minute.";
    }
  }
  const message = body(error)?.message;
  if (Array.isArray(message)) return message[0] ? readableApiMessage(message[0]) : fallback;
  if (typeof message === "string" && message.length > 0 && message !== "Internal server error") return readableApiMessage(message);
  return fallback;
}

/** The backend's machine-readable reason, e.g. "two_factor_required". */
export function errorCode(error: QueryError): string | undefined {
  return body(error)?.code;
}

export function errorStatus(error: QueryError): number | undefined {
  if (error && typeof error === "object" && "status" in error) {
    const status = (error as FetchBaseQueryError).status;
    return typeof status === "number" ? status : undefined;
  }
  return undefined;
}

/** The checklist the API attaches when it refuses to publish (`problems` in the error body). */
export function errorProblems(error: QueryError): string[] {
  const problems = (body(error) as { problems?: unknown } | null)?.problems;
  return Array.isArray(problems) ? problems.filter((p): p is string => typeof p === "string") : [];
}
