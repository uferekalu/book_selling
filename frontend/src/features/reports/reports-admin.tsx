"use client";

import { BarChart3, Download, Search } from "lucide-react";
import NextLink from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useDeferredValue, useMemo, useState } from "react";
import {
  Accordion,
  Badge,
  Button,
  Card,
  EmptyState,
  FormField,
  Icon,
  Input,
  Pagination,
  Select,
  Skeleton,
  TBody,
  TFoot,
  THead,
  Table,
  Tabs,
  Td,
  Th,
  Tr,
  useToast,
} from "@/components/ui";
import { AdminQueryError } from "@/features/admin/admin-query-error";
import { errorMessage } from "@/lib/api/errors";
import { saveObjectUrl, useSalesCsvMutation } from "@/lib/api/files-api";
import {
  salesParams,
  useEarningsReportQuery,
  useSalesReportQuery,
  type CurrencyTotals,
  type Delivery,
  type Grouping,
  type SaleRow,
  type SalesFilters,
} from "@/lib/api/reports-api";
import { countryName, countryOptions } from "@/lib/countries";
import { CURRENCIES, CURRENCY_LABEL, formatMoney, type Currency } from "@/lib/money";
import { PRESET_LABEL, PRESETS, REPORT_TIME_ZONE, periodLabel, rangeFromParams, rangeLabel, todayIn, type Preset } from "./report-range";

type Tab = "earnings" | "sales";

const PROVIDER: Record<string, string> = { paystack: "Paystack", flutterwave: "Flutterwave", stripe: "Stripe" };
const ORDER_STATUS: Record<string, string> = {
  paid: "Paid",
  fulfilled: "Fulfilled",
  partially_refunded: "Partly refunded",
  refunded: "Refunded",
};
const DELIVERY: Record<Delivery, { label: string; tone: "success" | "warning" | "info" | "primary" | "neutral" }> = {
  instant: { label: "Instant (ebook)", tone: "success" },
  not_required: { label: "Not required", tone: "neutral" },
  pending: { label: "Not shipped yet", tone: "warning" },
  processing: { label: "Being prepared", tone: "info" },
  shipped: { label: "Shipped", tone: "primary" },
  delivered: { label: "Delivered", tone: "success" },
};

const m = (amount: number, currency: Currency) => formatMoney({ amount, currency });
const country = (code: string | null) => (code ? countryName(code) : "Not given");
const paidAt = new Intl.DateTimeFormat("en-GB", {
  timeZone: REPORT_TIME_ZONE,
  day: "numeric",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});
const clock = new Intl.DateTimeFormat("en-GB", { timeZone: REPORT_TIME_ZONE, hour: "2-digit", minute: "2-digit" });
const shortDate = new Intl.DateTimeFormat("en-GB", { timeZone: REPORT_TIME_ZONE, day: "numeric", month: "short", year: "numeric" });

/**
 * Sales and earnings for the owner (BS-29). The date range lives in the URL, so a report can be
 * bookmarked or shared with an accountant. Every amount is shown in its own currency: naira and
 * dollars are never added together.
 */
export function ReportsAdmin() {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const today = useMemo(() => todayIn(REPORT_TIME_ZONE), []);
  const range = rangeFromParams(params, today);
  const tab: Tab = params.get("tab") === "sales" ? "sales" : "earnings";

  const setParams = (next: Record<string, string | null>) => {
    const merged = new URLSearchParams(params.toString());
    for (const [key, value] of Object.entries(next)) {
      if (value === null) merged.delete(key);
      else merged.set(key, value);
    }
    router.replace(`${pathname}?${merged.toString()}`, { scroll: false });
  };

  return (
    <div className="flex flex-col gap-6">
      <RangeBar
        preset={range.preset}
        from={range.from}
        to={range.to}
        onPreset={(preset) =>
          preset === "custom" ? setParams({ preset: "custom", from: range.from, to: range.to }) : setParams({ preset, from: null, to: null })
        }
        onDates={(from, to) => setParams({ preset: "custom", from, to })}
      />
      <Tabs<Tab>
        label="Reports"
        value={tab}
        onChange={(value) => setParams({ tab: value })}
        items={[
          { value: "earnings", label: "Earnings", content: <EarningsView from={range.from} to={range.to} /> },
          { value: "sales", label: "Sales", content: <SalesView from={range.from} to={range.to} /> },
        ]}
      />
    </div>
  );
}

function RangeBar({
  preset,
  from,
  to,
  onPreset,
  onDates,
}: {
  preset: Preset;
  from: string;
  to: string;
  onPreset: (preset: Preset) => void;
  onDates: (from: string, to: string) => void;
}) {
  return (
    <Card variant="sunken" padding="sm" className="flex flex-col gap-4 sm:flex-row sm:items-end sm:flex-wrap">
      <FormField label="Period" className="sm:w-52">
        <Select value={preset} onChange={(e) => onPreset(e.target.value as Preset)} options={PRESETS.map((p) => ({ value: p, label: PRESET_LABEL[p] }))} />
      </FormField>
      {preset === "custom" && (
        <>
          <FormField label="From" className="sm:w-44">
            <Input type="date" value={from} max={to} onChange={(e) => e.target.value && e.target.value <= to && onDates(e.target.value, to)} />
          </FormField>
          <FormField label="To" className="sm:w-44">
            <Input type="date" value={to} min={from} onChange={(e) => e.target.value && e.target.value >= from && onDates(from, e.target.value)} />
          </FormField>
        </>
      )}
      <p className="text-sm text-text-muted sm:pb-3">
        {rangeLabel(from, to)} · Nigeria time
      </p>
    </Card>
  );
}

// ---------------------------------------------------------------- earnings

function EarningsView({ from, to }: { from: string; to: string }) {
  const [grouping, setGrouping] = useState<Grouping>("month");
  const { data, isFetching, error, refetch } = useEarningsReportQuery({ from, to, grouping });

  if (error) return <div className="pt-4"><AdminQueryError error={error} onRetry={() => void refetch()} /></div>;
  if (!data) return <Skeleton className="mt-4 h-96 w-full rounded-2xl" />;
  if (!data.totals.length) {
    return (
      <div className="pt-4">
        <EmptyState icon={BarChart3} title="No sales in this period" description="Choose another period above. Unpaid, expired and cancelled orders are never counted." />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-8 pt-4" aria-busy={isFetching}>
      <p className="max-w-3xl text-text-muted">
        Money received from paid orders between {rangeLabel(from, to)}, Nigeria time. Each currency is reported on its own, because amounts in
        different currencies can&rsquo;t be added. Earnings are shown before the payment companies&rsquo; fees.
      </p>

      <div className="grid gap-5 lg:grid-cols-2">
        {data.totals.map((t) => (
          <CurrencySummary key={t.currency} totals={t} />
        ))}
      </div>

      <Accordion
        headingLevel={3}
        items={[
          {
            id: "how",
            title: "How these figures are worked out",
            content: (
              <dl className="grid gap-3 text-sm sm:grid-cols-2">
                <Definition term="Book sales">The books&rsquo; prices × the copies sold, before any discount code.</Definition>
                <Definition term="Discounts">Taken off by discount codes on those orders.</Definition>
                <Definition term="Shipping charged">What buyers paid for delivering print copies.</Definition>
                <Definition term="Received">What buyers actually paid: book sales − discounts + shipping (+ tax, if any).</Definition>
                <Definition term="Refunds">Money given back on these orders, whenever the refund was made.</Definition>
                <Definition term="Net earnings">Received − refunds. The payment companies&rsquo; fees are taken from this.</Definition>
                <Definition term="A sale">An order that was paid. It counts on the day the payment was confirmed, in Nigeria time.</Definition>
                <Definition term="Not counted">Orders never paid, expired or cancelled.</Definition>
              </dl>
            ),
          },
        ]}
      />

      <section className="flex min-w-0 flex-col gap-3" aria-labelledby="by-period">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <h3 id="by-period" className="text-xl font-medium">
            Over time
          </h3>
          <FormField label="Group by" className="w-40">
            <Select
              value={grouping}
              onChange={(e) => setGrouping(e.target.value as Grouping)}
              options={[
                { value: "day", label: "Day" },
                { value: "week", label: "Week" },
                { value: "month", label: "Month" },
              ]}
            />
          </FormField>
        </div>
        <Table caption="Earnings over time">
          <THead>
            <Tr>
              <Th>{grouping === "day" ? "Day" : grouping === "week" ? "Week" : "Month"}</Th>
              <Th numeric>Orders</Th>
              <Th numeric>Ebooks</Th>
              <Th numeric>Print</Th>
              <Th numeric>Received</Th>
              <Th numeric>Refunds</Th>
              <Th numeric>Net earnings</Th>
            </Tr>
          </THead>
          <TBody>
            {data.periods.map((p) => (
              <Tr key={`${p.period}-${p.currency}`}>
                <Td className="whitespace-nowrap">
                  {periodLabel(p.period, data.grouping)} <span className="text-text-subtle">· {p.currency}</span>
                </Td>
                <Td numeric>{p.orders}</Td>
                <Td numeric>{p.ebookCopies}</Td>
                <Td numeric>{p.printCopies}</Td>
                <Td numeric>{m(p.received, p.currency)}</Td>
                <Td numeric>{p.refunds ? `−${m(p.refunds, p.currency)}` : "—"}</Td>
                <Td numeric className="font-semibold">
                  {m(p.net, p.currency)}
                </Td>
              </Tr>
            ))}
          </TBody>
        </Table>
      </section>

      <section className="flex min-w-0 flex-col gap-3" aria-labelledby="by-book">
        <h3 id="by-book" className="text-xl font-medium">
          By book
        </h3>
        <Table caption="Earnings by book">
          <THead>
            <Tr>
              <Th>Book</Th>
              <Th numeric>Ebooks</Th>
              <Th numeric>Print</Th>
              <Th numeric>Sales</Th>
              <Th numeric>After discounts</Th>
            </Tr>
          </THead>
          <TBody>
            {data.books.map((b) => (
              <Tr key={`${b.bookId}-${b.currency}`}>
                <Td className="min-w-48">
                  {b.title} <span className="text-text-subtle">· {b.currency}</span>
                </Td>
                <Td numeric>{b.ebookCopies}</Td>
                <Td numeric>{b.printCopies}</Td>
                <Td numeric>{m(b.sales, b.currency)}</Td>
                <Td numeric className="font-semibold">
                  {m(b.net, b.currency)}
                </Td>
              </Tr>
            ))}
          </TBody>
        </Table>
        <p className="text-xs text-text-subtle">
          A discount code on an order is shared across its books in proportion to their prices. Shipping is not part of a book&rsquo;s figure.
        </p>
      </section>

      <div className="grid min-w-0 grid-cols-1 gap-8 xl:grid-cols-2">
        <section className="flex min-w-0 flex-col gap-3" aria-labelledby="by-country">
          <h3 id="by-country" className="text-xl font-medium">
            By country
          </h3>
          <Table caption="Earnings by country">
            <THead>
              <Tr>
                <Th>Country</Th>
                <Th numeric>Orders</Th>
                <Th numeric>Received</Th>
                <Th numeric>Net</Th>
              </Tr>
            </THead>
            <TBody>
              {data.countries.map((c) => (
                <Tr key={`${c.country}-${c.currency}`}>
                  <Td>
                    {country(c.country)} <span className="text-text-subtle">· {c.currency}</span>
                  </Td>
                  <Td numeric>{c.orders}</Td>
                  <Td numeric>{m(c.received, c.currency)}</Td>
                  <Td numeric>{m(c.net, c.currency)}</Td>
                </Tr>
              ))}
            </TBody>
          </Table>
          <p className="text-xs text-text-subtle">Print orders count where they were shipped; ebook orders, the country the buyer gave.</p>
        </section>
        <section className="flex min-w-0 flex-col gap-3" aria-labelledby="by-provider">
          <h3 id="by-provider" className="text-xl font-medium">
            By payment method
          </h3>
          <Table caption="Earnings by payment method">
            <THead>
              <Tr>
                <Th>Paid with</Th>
                <Th numeric>Orders</Th>
                <Th numeric>Received</Th>
                <Th numeric>Net</Th>
              </Tr>
            </THead>
            <TBody>
              {data.providers.map((p) => (
                <Tr key={`${p.provider}-${p.currency}`}>
                  <Td>
                    {PROVIDER[p.provider] ?? p.provider} <span className="text-text-subtle">· {p.currency}</span>
                  </Td>
                  <Td numeric>{p.orders}</Td>
                  <Td numeric>{m(p.received, p.currency)}</Td>
                  <Td numeric>{m(p.net, p.currency)}</Td>
                </Tr>
              ))}
            </TBody>
          </Table>
          <p className="text-xs text-text-subtle">Each company pays out to the bank account set up with it; its own dashboard shows its fees.</p>
        </section>
      </div>
    </div>
  );
}

function CurrencySummary({ totals: t }: { totals: CurrencyTotals }) {
  const line = (label: string, amount: number, sign = "") => (
    <div className="flex justify-between gap-4 py-1.5">
      <dt className="text-text-muted">{label}</dt>
      <dd className="tabular-nums">
        {sign}
        {m(amount, t.currency)}
      </dd>
    </div>
  );
  return (
    <Card as="section" aria-labelledby={`sum-${t.currency}`} className="flex flex-col gap-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 id={`sum-${t.currency}`} className="text-lg font-medium">
          {CURRENCY_LABEL[t.currency]}
        </h3>
        <span className="text-sm text-text-muted">
          {t.orders} {t.orders === 1 ? "order" : "orders"} · {t.ebookCopies} {t.ebookCopies === 1 ? "ebook" : "ebooks"} · {t.printCopies} print{" "}
          {t.printCopies === 1 ? "copy" : "copies"}
        </span>
      </div>
      <div>
        <p className="text-sm text-text-muted">Net earnings</p>
        <p className="font-display text-4xl tabular-nums">{m(t.net, t.currency)}</p>
      </div>
      <dl className="divide-y divide-border text-sm">
        {line("Book sales", t.bookSales)}
        {t.discounts > 0 && line("Discounts", t.discounts, "−")}
        {line("Shipping charged", t.shipping, "+")}
        {t.tax > 0 && line("Tax", t.tax, "+")}
        <div className="flex justify-between gap-4 py-1.5 font-medium">
          <dt>Received from buyers</dt>
          <dd className="tabular-nums">{m(t.received, t.currency)}</dd>
        </div>
        {line("Refunds", t.refunds, t.refunds ? "−" : "")}
        <div className="flex justify-between gap-4 py-1.5 font-semibold">
          <dt>Net earnings</dt>
          <dd className="tabular-nums">{m(t.net, t.currency)}</dd>
        </div>
        {line("Average order", t.averageOrder)}
      </dl>
    </Card>
  );
}

function Definition({ term, children }: { term: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="font-medium text-text">{term}</dt>
      <dd className="text-text-muted">{children}</dd>
    </div>
  );
}

// ---------------------------------------------------------------- sales

function SalesView({ from, to }: { from: string; to: string }) {
  const [filters, setFilters] = useState<Omit<SalesFilters, "from" | "to">>({});
  const [search, setSearch] = useState("");
  const q = useDeferredValue(search.trim());
  const [page, setPage] = useState(1);
  const all: SalesFilters = { from, to, ...filters, ...(q ? { q } : {}) };
  const { data, isFetching, error, refetch } = useSalesReportQuery({ filters: all, page });
  const [download, downloadState] = useSalesCsvMutation();
  const { toast } = useToast();
  const countries = useMemo(() => countryOptions(), []);

  const set = <K extends keyof typeof filters>(key: K, value: string) => {
    setPage(1);
    setFilters((current) => ({ ...current, [key]: value || undefined }));
  };

  const saveCsv = () =>
    void download(salesParams(all))
      .unwrap()
      .then((url) => saveObjectUrl(url, `sales-${from}-to-${to}.csv`))
      .catch((e: unknown) => toast({ title: errorMessage(e), tone: "danger" }));

  return (
    <div className="flex flex-col gap-5 pt-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <FormField label="Search" className="sm:col-span-2 lg:col-span-4">
          <Input
            type="search"
            value={search}
            onChange={(e) => {
              setPage(1);
              setSearch(e.target.value);
            }}
            placeholder="Book title, buyer name or email, order number"
            leading={<Icon icon={Search} size="sm" />}
          />
        </FormField>
        <FormField label="Currency">
          <Select
            value={filters.currency ?? ""}
            onChange={(e) => set("currency", e.target.value)}
            options={[{ value: "", label: "All currencies" }, ...CURRENCIES.map((c) => ({ value: c, label: CURRENCY_LABEL[c] }))]}
          />
        </FormField>
        <FormField label="Format">
          <Select
            value={filters.format ?? ""}
            onChange={(e) => set("format", e.target.value)}
            options={[
              { value: "", label: "Ebooks and print" },
              { value: "ebook", label: "Ebooks" },
              { value: "print", label: "Print copies" },
            ]}
          />
        </FormField>
        <FormField label="Delivery">
          <Select
            value={filters.delivery ?? ""}
            onChange={(e) => set("delivery", e.target.value)}
            options={[
              { value: "", label: "Any" },
              { value: "instant", label: "Instant (ebooks)" },
              { value: "pending", label: "Not shipped yet" },
              { value: "processing", label: "Being prepared" },
              { value: "shipped", label: "Shipped" },
              { value: "delivered", label: "Delivered" },
            ]}
          />
        </FormField>
        <FormField label="Country">
          <Select
            value={filters.country ?? ""}
            onChange={(e) => set("country", e.target.value)}
            options={[{ value: "", label: "All countries" }, ...countries]}
          />
        </FormField>
      </div>

      {error ? (
        <AdminQueryError error={error} onRetry={() => void refetch()} />
      ) : !data ? (
        <Skeleton className="h-96 w-full rounded-2xl" />
      ) : !data.total ? (
        <EmptyState icon={BarChart3} title="No sales match" description="Try another period or clear a filter." />
      ) : (
        <>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between" aria-busy={isFetching}>
            <p className="text-sm text-text-muted">
              {data.total} {data.total === 1 ? "book sold" : "books sold"} (one line per book per order) ·{" "}
              {data.sums.map((s, i) => (
                <span key={s.currency}>
                  {i > 0 && " · "}
                  <span className="font-medium text-text">{m(s.lineNet, s.currency)}</span> from {s.copies} {s.copies === 1 ? "copy" : "copies"}
                </span>
              ))}
            </p>
            <Button variant="outline" size="sm" isLoading={downloadState.isLoading} leadingIcon={<Icon icon={Download} size="sm" />} onClick={saveCsv}>
              Download spreadsheet (CSV)
            </Button>
          </div>

          {/* Phones: one card per sale. */}
          <ul className="flex flex-col gap-3 md:hidden">
            {data.rows.map((r) => (
              <li key={`${r.orderNumber}-${r.bookId}-${r.format}`}>
                <SaleCard row={r} />
              </li>
            ))}
          </ul>

          {/* Tablets and up: the full table. */}
          <div className="hidden md:block">
            <Table caption="Books sold">
              <THead>
                <Tr>
                  <Th>Paid</Th>
                  <Th>Order</Th>
                  <Th>Book</Th>
                  <Th numeric>Copies × price</Th>
                  <Th numeric>Discount</Th>
                  <Th numeric>Paid for book</Th>
                  <Th>Buyer</Th>
                  <Th>Country</Th>
                  <Th>Delivery</Th>
                </Tr>
              </THead>
              <TBody>
                {data.rows.map((r) => (
                  <Tr key={`${r.orderNumber}-${r.bookId}-${r.format}`}>
                    <Td className="whitespace-nowrap text-text-muted">
                      {shortDate.format(new Date(r.paidAt))}
                      <span className="block text-xs text-text-subtle">{clock.format(new Date(r.paidAt))}</span>
                    </Td>
                    <Td className="whitespace-nowrap">
                      <NextLink href={`/admin/orders/${r.orderNumber}`} className="font-medium text-primary underline-offset-4 hover:underline">
                        {r.orderNumber}
                      </NextLink>
                      <span className="block text-xs text-text-subtle">
                        {PROVIDER[r.provider] ?? r.provider}
                        {r.coupon && ` · code ${r.coupon}`}
                      </span>
                      {r.orderStatus !== "paid" && <span className="block text-xs text-warning">{ORDER_STATUS[r.orderStatus] ?? r.orderStatus}</span>}
                    </Td>
                    <Td className="min-w-44">
                      {r.title}
                      <span className="block text-xs text-text-subtle">{r.format === "ebook" ? "Ebook" : "Print copy"}</span>
                    </Td>
                    <Td numeric>
                      {r.quantity} × {m(r.unitPrice, r.currency)}
                    </Td>
                    <Td numeric>{r.discount ? `−${m(r.discount, r.currency)}` : "—"}</Td>
                    <Td numeric className="font-semibold">
                      {m(r.lineNet, r.currency)}
                    </Td>
                    <Td className="min-w-44">
                      {r.buyerName}
                      <span className="block text-xs break-all text-text-subtle">{r.buyerEmail}</span>
                    </Td>
                    <Td className="whitespace-nowrap">
                      {country(r.country)}
                      {r.city && <span className="block text-xs text-text-subtle">{r.city}</span>}
                    </Td>
                    <Td className="min-w-36">
                      <DeliveryCell row={r} />
                    </Td>
                  </Tr>
                ))}
              </TBody>
              <TFoot>
                {data.sums.map((s) => (
                  <Tr key={s.currency}>
                    <Td colSpan={3}>Total, {CURRENCY_LABEL[s.currency]}</Td>
                    <Td numeric>
                      {s.copies} {s.copies === 1 ? "copy" : "copies"} · {m(s.lineTotal, s.currency)}
                    </Td>
                    <Td numeric>{s.discount ? `−${m(s.discount, s.currency)}` : "—"}</Td>
                    <Td numeric>{m(s.lineNet, s.currency)}</Td>
                    <Td colSpan={3} />
                  </Tr>
                ))}
              </TFoot>
            </Table>
          </div>

          <p className="text-xs text-text-subtle">
            Totals cover all {data.total} lines matching the filters, not only this page. Shipping charges are whole-order amounts, shown in the
            Earnings tab and the spreadsheet.
          </p>

          <Pagination page={data.page} totalPages={Math.ceil(data.total / data.pageSize)} onPageChange={setPage} />
        </>
      )}
    </div>
  );
}

function DeliveryCell({ row: r }: { row: SaleRow }) {
  const d = DELIVERY[r.delivery];
  return (
    <div className="flex flex-col items-start gap-1">
      <Badge tone={d.tone} size="sm">
        {d.label}
      </Badge>
      {r.carrier && (
        <span className="text-xs text-text-subtle">
          {r.carrier}
          {r.trackingNumber && ` · ${r.trackingNumber}`}
        </span>
      )}
      {r.shippedAt && <span className="text-xs text-text-subtle">Shipped {shortDate.format(new Date(r.shippedAt))}</span>}
      {r.deliveredAt && <span className="text-xs text-text-subtle">Delivered {shortDate.format(new Date(r.deliveredAt))}</span>}
    </div>
  );
}

function SaleCard({ row: r }: { row: SaleRow }) {
  return (
    <Card padding="sm" className="flex flex-col gap-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-medium wrap-anywhere text-text">{r.title}</p>
          <p className="text-sm text-text-muted">
            {r.format === "ebook" ? "Ebook" : "Print copy"} × {r.quantity}
          </p>
        </div>
        <p className="shrink-0 text-right font-semibold tabular-nums">{m(r.lineNet, r.currency)}</p>
      </div>
      <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
        <div>
          <dt className="text-xs text-text-subtle">Buyer</dt>
          <dd className="wrap-anywhere">{r.buyerName}</dd>
          <dd className="text-xs break-all text-text-muted">{r.buyerEmail}</dd>
        </div>
        <div>
          <dt className="text-xs text-text-subtle">Country</dt>
          <dd>
            {country(r.country)}
            {r.city ? `, ${r.city}` : ""}
          </dd>
        </div>
        <div>
          <dt className="text-xs text-text-subtle">Order</dt>
          <dd>
            <NextLink href={`/admin/orders/${r.orderNumber}`} className="text-primary underline-offset-4 hover:underline">
              {r.orderNumber}
            </NextLink>
          </dd>
          <dd className="text-xs text-text-muted">{paidAt.format(new Date(r.paidAt))}</dd>
        </div>
        <div>
          <dt className="text-xs text-text-subtle">Paid with</dt>
          <dd>{PROVIDER[r.provider] ?? r.provider}</dd>
          {r.discount > 0 && <dd className="text-xs text-text-muted">Discount −{m(r.discount, r.currency)}</dd>}
        </div>
      </dl>
      <DeliveryCell row={r} />
    </Card>
  );
}
