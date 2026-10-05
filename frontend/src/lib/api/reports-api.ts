import type { Currency } from "@/lib/money";
import { api } from "./api";

// Shapes of /admin/reports (backend/src/reports, BS-29). Amounts are integer minor units, always
// with their currency; totals are per currency and never added across currencies.

export type Grouping = "day" | "week" | "month";
export type Delivery = "instant" | "not_required" | "pending" | "processing" | "shipped" | "delivered";

export interface ReportRange {
  from: string;
  to: string;
}

export interface SalesFilters extends ReportRange {
  currency?: Currency;
  format?: "ebook" | "print";
  country?: string;
  delivery?: Delivery;
  q?: string;
}

export interface SaleRow {
  paidAt: string;
  orderNumber: string;
  orderStatus: string;
  bookId: string;
  title: string;
  format: "ebook" | "print";
  quantity: number;
  unitPrice: number;
  lineTotal: number;
  discount: number;
  lineNet: number;
  currency: Currency;
  buyerName: string;
  buyerEmail: string;
  country: string | null;
  city: string | null;
  provider: string;
  coupon: string | null;
  delivery: Delivery;
  carrier: string | null;
  trackingNumber: string | null;
  shippedAt: string | null;
  deliveredAt: string | null;
  orderShipping: number;
  orderTotal: number;
  orderRefunded: number;
}

export interface SalesReport {
  rows: SaleRow[];
  total: number;
  page: number;
  pageSize: number;
  timeZone: string;
  sums: Array<{ currency: Currency; copies: number; lineTotal: number; discount: number; lineNet: number }>;
}

export interface CurrencyTotals {
  currency: Currency;
  orders: number;
  ebookCopies: number;
  printCopies: number;
  bookSales: number;
  discounts: number;
  shipping: number;
  tax: number;
  received: number;
  refunds: number;
  net: number;
  averageOrder: number;
}

export interface EarningsReport {
  totals: CurrencyTotals[];
  periods: Array<{ period: string } & CurrencyTotals>;
  books: Array<{ bookId: string; title: string; currency: Currency; ebookCopies: number; printCopies: number; sales: number; net: number }>;
  countries: Array<{ country: string | null } & CurrencyTotals>;
  providers: Array<{ provider: string } & CurrencyTotals>;
  timeZone: string;
  grouping: Grouping;
}

/** Only the filters that are set, so the request (and the cache key) stays clean. */
export function salesParams(filters: SalesFilters, page?: number): Record<string, string | number> {
  const params: Record<string, string | number> = { from: filters.from, to: filters.to };
  for (const key of ["currency", "format", "country", "delivery", "q"] as const) {
    const value = filters[key]?.trim();
    if (value) params[key] = value;
  }
  if (page && page > 1) params.page = page;
  return params;
}

export const reportsApi = api.injectEndpoints({
  endpoints: (builder) => ({
    salesReport: builder.query<SalesReport, { filters: SalesFilters; page: number }>({
      query: ({ filters, page }) => ({ url: "/admin/reports/sales", params: salesParams(filters, page) }),
      providesTags: ["AdminOrders"],
    }),
    earningsReport: builder.query<EarningsReport, ReportRange & { grouping: Grouping }>({
      query: (params) => ({ url: "/admin/reports/earnings", params }),
      providesTags: ["AdminOrders"],
    }),
  }),
});

export const { useSalesReportQuery, useEarningsReportQuery } = reportsApi;
