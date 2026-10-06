import type { Currency } from "@/lib/money";
import { api } from "./api";
import type { CurrencyTotals } from "./reports-api";

// Shapes of /admin/dashboard, /admin/customers and /admin/audit-log (backend/src/admin, BS-12).
// Amounts are integer minor units with their currency, never added across currencies.

export interface Money {
  currency: Currency;
  amount: number;
}

export interface Dashboard {
  timeZone: string;
  windows: Record<"today" | "week" | "month", { from: string; to: string }>;
  attention: {
    orders: Array<{ orderNumber: string; reason: string; total: number; currency: Currency; at: string | null }>;
    orderCount: number;
    payments: Array<{
      orderNumber: string | null;
      provider: string;
      reference: string;
      amount: number;
      currency: Currency;
      reason: string;
      at: string | null;
    }>;
    paymentCount: number;
    emailProblems: number;
    toShip: { count: number; oldest: { orderNumber: string; paidAt: string } | null };
    messages: { unreadConversations: number; newContacts: number };
  };
  revenue: {
    today: CurrencyTotals[];
    week: CurrencyTotals[];
    month: CurrencyTotals[];
    daily: Array<{ date: string; currency: Currency; received: number }>;
  };
  bestSellers: Array<{ bookId: string; title: string; copies: number; ebookCopies: number; printCopies: number; sales: Money[] }>;
  conversion: Array<{
    bookId: string;
    title: string;
    slug: string;
    readers: number;
    finished: number;
    buyClicks: number;
    orders: number;
    rate: number | null;
  }>;
  lowStock: Array<{ bookId: string; title: string; left: number; reserved: number }>;
  lowStockThreshold: number;
  customers: { total: number; newThisMonth: number };
}

export interface CustomerRow {
  id: string;
  name: string;
  email: string;
  role: "customer" | "admin" | "owner";
  accountStatus: string;
  guest: boolean;
  emailVerified: boolean;
  twoFactor: boolean;
  country: string | null;
  joinedAt: string;
  lastLoginAt: string | null;
  orders: number;
  lastOrderAt: string | null;
  spent: Money[];
}

export interface AuditEntry {
  id: string;
  at: string;
  action: string;
  actor: { id: string; role: string | null; name: string | null; email: string | null } | null;
  entityType: string;
  entityId: string;
  entityLabel: string | null;
  entityHref: string | null;
  changes: Record<string, unknown> | null;
  ip: string | null;
}

interface Paged<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

export const adminApi = api.injectEndpoints({
  endpoints: (builder) => ({
    dashboard: builder.query<Dashboard, void>({
      query: () => "/admin/dashboard",
      providesTags: ["AdminDashboard"],
    }),
    customers: builder.query<Paged<CustomerRow>, { q?: string; role?: "customer" | "staff"; page: number }>({
      query: (params) => ({ url: "/admin/customers", params }),
      providesTags: ["AdminCustomers"],
    }),
    changeRole: builder.mutation<unknown, { id: string; role: "customer" | "admin" }>({
      query: ({ id, role }) => ({ url: `/users/${id}/role`, method: "PATCH", body: { role } }),
      invalidatesTags: ["AdminCustomers", "AdminAudit"],
    }),
    auditLog: builder.query<Paged<AuditEntry> & { entityTypes: string[] }, { q?: string; entityType?: string; page: number }>({
      query: (params) => ({ url: "/admin/audit-log", params }),
      providesTags: ["AdminAudit"],
    }),
  }),
});

export const { useDashboardQuery, useCustomersQuery, useChangeRoleMutation, useAuditLogQuery } = adminApi;
