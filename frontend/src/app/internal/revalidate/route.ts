import { timingSafeEqual } from "node:crypto";
import { revalidateTag } from "next/cache";
import { NextResponse, type NextRequest } from "next/server";

/**
 * Called by the API after catalogue edits (backend StorefrontRevalidator) so the change shows on
 * the next visit. `expire: 0`: a price or title change must never be served stale. Protected by a
 * shared secret compared in constant time; tags are limited to the catalogue's own names.
 */
const ALLOWED_TAG = /^(catalog|book:[a-z0-9-]{1,80}|author:[a-z0-9-]{1,80})$/;

function secretMatches(given: string | null): boolean {
  const expected = process.env.REVALIDATE_SECRET;
  if (!expected || !given) return false;
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function POST(request: NextRequest) {
  if (!secretMatches(request.headers.get("x-revalidate-secret"))) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }
  let tags: unknown;
  try {
    ({ tags } = (await request.json()) as { tags?: unknown });
  } catch {
    return NextResponse.json({ message: "Invalid JSON" }, { status: 400 });
  }
  if (!Array.isArray(tags) || tags.length === 0 || tags.length > 50 || !tags.every((t) => typeof t === "string" && ALLOWED_TAG.test(t))) {
    return NextResponse.json({ message: "Invalid tags" }, { status: 400 });
  }
  for (const tag of tags as string[]) revalidateTag(tag, { expire: 0 });
  return NextResponse.json({ revalidated: tags.length });
}
