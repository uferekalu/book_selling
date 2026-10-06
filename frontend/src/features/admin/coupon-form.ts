import { z } from "zod";
import type { Coupon, CouponInput } from "@/lib/api/engagement-api";
import { CURRENCIES, type Currency } from "@/lib/money";

/** What the discount-code form holds (amounts are integer minor units, or null when empty). */
export interface CouponFormValues {
  code: string;
  description: string;
  kind: "percent" | "fixed";
  percentOff: string;
  amountsOff: Record<Currency, number | null>;
  minSubtotals: Record<Currency, number | null>;
  ebook: boolean;
  print: boolean;
  /** `datetime-local` values (the owner's local time), or "". */
  startsAt: string;
  endsAt: string;
  maxRedemptions: string;
  perCustomerLimit: string;
  active: boolean;
}

const emptyAmounts = (): Record<Currency, number | null> => ({ NGN: null, USD: null, GBP: null, EUR: null });
const positiveInt = (text: string) => /^\d+$/.test(text.trim()) && Number(text) >= 1;

export const couponFormSchema = z
  .object({
    code: z
      .string()
      .trim()
      .toUpperCase()
      .regex(/^[A-Z0-9_-]{3,30}$/, "3–30 letters, numbers, dashes or underscores (e.g. LECTURE10)"),
    description: z.string().trim().max(200, "Keep it under 200 characters"),
    kind: z.enum(["percent", "fixed"]),
    percentOff: z.string(),
    amountsOff: z.record(z.enum(CURRENCIES), z.number().int().nullable()),
    minSubtotals: z.record(z.enum(CURRENCIES), z.number().int().nullable()),
    ebook: z.boolean(),
    print: z.boolean(),
    startsAt: z.string(),
    endsAt: z.string(),
    maxRedemptions: z.string(),
    perCustomerLimit: z.string(),
    active: z.boolean(),
  })
  .superRefine((v, ctx) => {
    if (v.kind === "percent") {
      const n = Number(v.percentOff);
      if (!/^\d+$/.test(v.percentOff.trim()) || n < 1 || n > 100) {
        ctx.addIssue({ code: "custom", path: ["percentOff"], message: "A whole percentage from 1 to 100" });
      }
    } else if (!CURRENCIES.some((c) => (v.amountsOff[c] ?? 0) > 0)) {
      ctx.addIssue({ code: "custom", path: ["amountsOff"], message: "Enter the amount off in at least one currency" });
    }
    if (!v.ebook && !v.print) {
      ctx.addIssue({ code: "custom", path: ["ebook"], message: "Choose ebooks, print copies or both" });
    }
    if (v.startsAt && v.endsAt && new Date(v.endsAt) <= new Date(v.startsAt)) {
      ctx.addIssue({ code: "custom", path: ["endsAt"], message: "The end must be after the start" });
    }
    for (const key of ["maxRedemptions", "perCustomerLimit"] as const) {
      if (v[key].trim() && !positiveInt(v[key])) {
        ctx.addIssue({ code: "custom", path: [key], message: "A whole number of 1 or more, or leave empty for no limit" });
      }
    }
  });

/** `2026-10-05T14:30` (local) from an ISO instant, for a datetime-local input. */
export function toLocalInput(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function formFromCoupon(coupon: Coupon | null): CouponFormValues {
  const amounts = (list: Coupon["amountsOff"]) => {
    const out = emptyAmounts();
    for (const a of list) out[a.currency] = a.amount;
    return out;
  };
  const formats = coupon?.appliesTo.formats ?? [];
  return {
    code: coupon?.code ?? "",
    description: coupon?.description ?? "",
    kind: coupon?.kind ?? "percent",
    percentOff: coupon?.percentOff ? String(coupon.percentOff) : "",
    amountsOff: coupon ? amounts(coupon.amountsOff) : emptyAmounts(),
    minSubtotals: coupon ? amounts(coupon.minSubtotals) : emptyAmounts(),
    // An empty list means every format.
    ebook: formats.length === 0 || formats.includes("ebook"),
    print: formats.length === 0 || formats.includes("print"),
    startsAt: toLocalInput(coupon?.startsAt ?? null),
    endsAt: toLocalInput(coupon?.endsAt ?? null),
    maxRedemptions: coupon?.maxRedemptions ? String(coupon.maxRedemptions) : "",
    perCustomerLimit: coupon?.perCustomerLimit ? String(coupon.perCustomerLimit) : "",
    active: coupon?.active ?? true,
  };
}

/** The API body, built explicitly (the backend rejects unknown fields). Book limits are kept. */
export function couponInputFrom(values: CouponFormValues, bookIds: string[] = []): CouponInput {
  const amounts = (record: Record<Currency, number | null>) =>
    CURRENCIES.filter((c) => (record[c] ?? 0) > 0).map((currency) => ({ currency, amount: record[currency]! }));
  return {
    code: values.code.trim().toUpperCase(),
    description: values.description.trim(),
    kind: values.kind,
    ...(values.kind === "percent" ? { percentOff: Number(values.percentOff) } : {}),
    amountsOff: values.kind === "fixed" ? amounts(values.amountsOff) : [],
    minSubtotals: amounts(values.minSubtotals),
    appliesTo: { bookIds, formats: values.ebook && values.print ? [] : values.ebook ? ["ebook"] : ["print"] },
    ...(values.startsAt ? { startsAt: new Date(values.startsAt).toISOString() } : {}),
    ...(values.endsAt ? { endsAt: new Date(values.endsAt).toISOString() } : {}),
    ...(values.maxRedemptions.trim() ? { maxRedemptions: Number(values.maxRedemptions) } : {}),
    ...(values.perCustomerLimit.trim() ? { perCustomerLimit: Number(values.perCustomerLimit) } : {}),
    active: values.active,
  };
}
