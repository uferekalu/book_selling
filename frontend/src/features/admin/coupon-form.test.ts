import { describe, expect, it } from "vitest";
import type { Coupon } from "@/lib/api/engagement-api";
import { couponFormSchema, couponInputFrom, formFromCoupon } from "./coupon-form";

const blank = formFromCoupon(null);

describe("discount code form", () => {
  it("a percentage code: valid, upper-cased, all formats, no limits", () => {
    const values = { ...blank, code: " lecture10 ", percentOff: "10" };
    expect(couponFormSchema.safeParse(values).success).toBe(true);
    expect(couponInputFrom(values)).toEqual({
      code: "LECTURE10",
      description: "",
      kind: "percent",
      percentOff: 10,
      amountsOff: [],
      minSubtotals: [],
      appliesTo: { bookIds: [], formats: [] },
      active: true,
    });
  });

  it("refuses an invalid code, percentage, fixed amount, formats, dates and limits", () => {
    const issues = (over: object) =>
      (couponFormSchema.safeParse({ ...blank, code: "OK10", percentOff: "10", ...over }).error?.issues ?? []).map((i) => i.path.join("."));
    expect(issues({ code: "A" })).toEqual(["code"]);
    expect(issues({ percentOff: "150" })).toEqual(["percentOff"]);
    expect(issues({ percentOff: "7.5" })).toEqual(["percentOff"]);
    expect(issues({ kind: "fixed" })).toEqual(["amountsOff"]);
    expect(issues({ ebook: false, print: false })).toEqual(["ebook"]);
    expect(issues({ startsAt: "2026-11-01T00:00", endsAt: "2026-10-01T00:00" })).toEqual(["endsAt"]);
    expect(issues({ maxRedemptions: "0", perCustomerLimit: "two" })).toEqual(["maxRedemptions", "perCustomerLimit"]);
  });

  it("a fixed code sends only the currencies filled in, minimum spends, print only, and dates as instants", () => {
    const values = {
      ...blank,
      code: "SHIPFREE",
      kind: "fixed" as const,
      amountsOff: { NGN: 250_000, USD: null, GBP: 0, EUR: null },
      minSubtotals: { NGN: 2_000_000, USD: null, GBP: null, EUR: null },
      ebook: false,
      startsAt: "2026-10-05T09:00",
      maxRedemptions: "50",
    };
    const input = couponInputFrom(values, ["b1"]);
    expect(input).toMatchObject({
      kind: "fixed",
      amountsOff: [{ currency: "NGN", amount: 250_000 }],
      minSubtotals: [{ currency: "NGN", amount: 2_000_000 }],
      appliesTo: { bookIds: ["b1"], formats: ["print"] },
      maxRedemptions: 50,
    });
    expect(input.startsAt).toBe(new Date("2026-10-05T09:00").toISOString());
    expect("percentOff" in input).toBe(false);
  });

  it("round-trips an existing code into the form", () => {
    const coupon: Coupon = {
      id: "c1",
      code: "EBOOK20",
      description: "Ebooks only",
      kind: "percent",
      percentOff: 20,
      amountsOff: [],
      minSubtotals: [{ currency: "USD", amount: 2000 }],
      appliesTo: { bookIds: [], formats: ["ebook"] },
      startsAt: null,
      endsAt: null,
      maxRedemptions: 100,
      perCustomerLimit: 1,
      redemptionCount: 3,
      active: false,
    };
    const form = formFromCoupon(coupon);
    expect(form).toMatchObject({ percentOff: "20", ebook: true, print: false, maxRedemptions: "100", perCustomerLimit: "1", active: false });
    expect(form.minSubtotals.USD).toBe(2000);
    expect(couponInputFrom(form)).toMatchObject({ code: "EBOOK20", percentOff: 20, appliesTo: { formats: ["ebook"] }, minSubtotals: [{ currency: "USD", amount: 2000 }] });
  });
});
