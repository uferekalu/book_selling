import { afterEach, describe, expect, it } from "vitest";
import { checkoutKeyFor, fingerprintOf, forgetCheckoutKey, guestOrderKey, newCheckoutKey, rememberGuestOrder } from "./checkout-key";

const base = {
  currency: "USD",
  lines: [
    { bookId: "a", format: "ebook", quantity: 1 },
    { bookId: "b", format: "print", quantity: 2 },
  ],
  country: "NG",
  couponCode: "save10",
  email: "Ada@Example.com",
};

describe("checkout key", () => {
  afterEach(() => {
    window.sessionStorage.clear();
    window.localStorage.clear();
  });

  it("is random, URL-safe and long enough for the API", () => {
    const a = newCheckoutKey();
    expect(a).toMatch(/^[A-Za-z0-9_-]{24}$/);
    expect(newCheckoutKey()).not.toBe(a);
  });

  it("reuses the key for the same order details (a safe retry)", () => {
    const fp = fingerprintOf(base);
    expect(checkoutKeyFor(fp)).toBe(checkoutKeyFor(fp));
    // Order of lines, case of the email and code don't matter.
    expect(fingerprintOf({ ...base, lines: [...base.lines].reverse(), email: "ada@example.com", couponCode: "SAVE10" })).toBe(fp);
  });

  it("uses a new key when anything about the order changes, or after an order is placed", () => {
    const first = checkoutKeyFor(fingerprintOf(base));
    expect(checkoutKeyFor(fingerprintOf({ ...base, country: "GB" }))).not.toBe(first);
    const again = checkoutKeyFor(fingerprintOf(base));
    forgetCheckoutKey();
    expect(checkoutKeyFor(fingerprintOf(base))).not.toBe(again);
  });

  it("remembers a guest's orders on this device", () => {
    rememberGuestOrder("BS-2026-000001", "k".repeat(24));
    expect(guestOrderKey("BS-2026-000001")).toBe("k".repeat(24));
    expect(guestOrderKey("BS-2026-000002")).toBeNull();
  });
});
