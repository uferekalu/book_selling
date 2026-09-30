import { describe, expect, it } from "vitest";
import { formatMoney, isCurrency, toMajorUnits } from "./money";

describe("money", () => {
  it("converts minor units to major units", () => {
    expect(toMajorUnits({ amount: 2_500_000, currency: "NGN" })).toBe(25_000);
    expect(toMajorUnits({ amount: 2999, currency: "USD" })).toBe(29.99);
  });

  it("refuses a non-integer amount (a float means something upstream is wrong)", () => {
    expect(() => toMajorUnits({ amount: 29.99, currency: "USD" })).toThrow(/integer/);
  });

  it.each([
    [{ amount: 2_500_000, currency: "NGN" as const }, "₦25,000.00"],
    [{ amount: 2999, currency: "USD" as const }, "$29.99"],
    [{ amount: 2400, currency: "GBP" as const }, "£24.00"],
    [{ amount: 2850, currency: "EUR" as const }, "€28.50"],
    [{ amount: 0, currency: "USD" as const }, "$0.00"],
  ])("formats %o as %s", (money, expected) => {
    expect(formatMoney(money)).toBe(expected);
  });

  it("trims .00 on whole amounts only when asked", () => {
    expect(formatMoney({ amount: 3000, currency: "USD" }, { trimWholeAmounts: true })).toBe("$30");
    expect(formatMoney({ amount: 3050, currency: "USD" }, { trimWholeAmounts: true })).toBe("$30.50");
  });

  it("validates currency codes", () => {
    expect(isCurrency("NGN")).toBe(true);
    expect(isCurrency("JPY")).toBe(false);
    expect(isCurrency(undefined)).toBe(false);
  });
});
