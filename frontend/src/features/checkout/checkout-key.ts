/**
 * The Idempotency-Key for "place order" (ARCHITECTURE §8.2). The same order details reuse the same
 * key, so a retry after a dropped connection returns the order already created instead of a second
 * one. Any change (items, currency, address, code, email) gets a fresh key. The key is also a
 * guest's proof of access to their order, so it is random (144 bits) and kept in this tab only.
 */

const STORAGE_KEY = "bs_checkout_key";

export interface CheckoutFingerprint {
  currency: string;
  lines: Array<{ bookId: string; format: string; quantity: number }>;
  country: string | null;
  couponCode: string | null;
  email: string | null;
}

export function fingerprintOf(input: CheckoutFingerprint): string {
  return JSON.stringify({
    ...input,
    lines: [...input.lines].sort((a, b) => `${a.bookId}${a.format}`.localeCompare(`${b.bookId}${b.format}`)),
    email: input.email?.trim().toLowerCase() ?? null,
    couponCode: input.couponCode?.trim().toUpperCase() || null,
  });
}

export function newCheckoutKey(): string {
  const bytes = new Uint8Array(18);
  crypto.getRandomValues(bytes);
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

export function checkoutKeyFor(fingerprint: string, storage: Storage | null = safeSession()): string {
  try {
    const saved = JSON.parse(storage?.getItem(STORAGE_KEY) ?? "null") as { fingerprint: string; key: string } | null;
    if (saved?.fingerprint === fingerprint && /^[A-Za-z0-9_-]{22,100}$/.test(saved.key)) return saved.key;
  } catch {
    // fall through to a new key
  }
  const key = newCheckoutKey();
  try {
    storage?.setItem(STORAGE_KEY, JSON.stringify({ fingerprint, key }));
  } catch {
    // storage blocked: the key still works for this attempt
  }
  return key;
}

/** After an order is placed, the next checkout must not reuse its key. */
export function forgetCheckoutKey(storage: Storage | null = safeSession()): void {
  try {
    storage?.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
}

function safeSession(): Storage | null {
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}

const GUEST_ORDERS_KEY = "bs_guest_orders";

/** A guest's orders on this device (number + key), so they can come back to them. */
export function rememberGuestOrder(orderNumber: string, checkoutKey: string): void {
  try {
    const all = JSON.parse(window.localStorage.getItem(GUEST_ORDERS_KEY) ?? "[]") as Array<{ orderNumber: string; checkoutKey: string }>;
    const next = [{ orderNumber, checkoutKey }, ...all.filter((o) => o.orderNumber !== orderNumber)].slice(0, 20);
    window.localStorage.setItem(GUEST_ORDERS_KEY, JSON.stringify(next));
  } catch {
    // ignore
  }
}

export function guestOrderKey(orderNumber: string): string | null {
  try {
    const all = JSON.parse(window.localStorage.getItem(GUEST_ORDERS_KEY) ?? "[]") as Array<{ orderNumber: string; checkoutKey: string }>;
    return all.find((o) => o.orderNumber === orderNumber)?.checkoutKey ?? null;
  } catch {
    return null;
  }
}
