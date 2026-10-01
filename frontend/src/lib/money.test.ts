import { describe, expect, it } from "vitest";
import { formatMoney, isCurrency, minorToInput, parseMajorToMinor, toMajorUnits } from "./money";

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

describe("parseMajorToMinor", () => {
  it.each([
    ["29.99", "USD", 2999],
    ["25,000", "NGN", 2_500_000],
    ["25 000.5", "EUR", 2_500_050],
    ["₦ 1,500", "NGN", 150_000],
    ["£24", "GBP", 2400],
    ["0.07", "USD", 7],
    [".5", "USD", null],
    ["007.10", "USD", 710],
    ["19.", "USD", 1900],
  ] as const)("reads %s (%s) as %s", (text, currency, expected) => {
    expect(parseMajorToMinor(text, currency)).toBe(expected);
  });

  it("is exact where floating-point maths is not", () => {
    // 1.15 * 100 === 114.99999999999999 and 4.35 * 100 === 434.99999999999994
    expect(parseMajorToMinor("1.15", "USD")).toBe(115);
    expect(parseMajorToMinor("4.35", "USD")).toBe(435);
  });

  it.each(["", "abc", "-5", "1.999", "1e5", "12.3.4", "１２"])("rejects %j", (text) => {
    expect(parseMajorToMinor(text, "USD")).toBeNull();
  });
});

describe("minorToInput", () => {
  it.each([
    [2999, "USD", "29.99"],
    [2_500_000, "NGN", "25000.00"],
    [7, "GBP", "0.07"],
    [0, "EUR", "0.00"],
  ] as const)("writes %s %s as %s", (amount, currency, expected) => {
    expect(minorToInput(amount, currency)).toBe(expected);
  });

  it("round-trips through parseMajorToMinor", () => {
    for (const amount of [1, 99, 100, 2999, 123_456_789]) {
      expect(parseMajorToMinor(minorToInput(amount, "USD"), "USD")).toBe(amount);
    }
  });
});
