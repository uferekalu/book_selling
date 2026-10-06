"use client";

import { ArrowRight, BarChart3, CheckCircle2, Users } from "lucide-react";
import NextLink from "next/link";
import {
  Badge,
  BarChart,
  ButtonLink,
  Card,
  EmptyState,
  Icon,
  Skeleton,
  TBody,
  THead,
  Table,
  Td,
  Th,
  Tr,
} from "@/components/ui";
import { useDashboardQuery, type Dashboard } from "@/lib/api/admin-api";
import type { CurrencyTotals } from "@/lib/api/reports-api";
import { CURRENCY_LABEL, formatMoney, type Currency } from "@/lib/money";
import { AdminQueryError } from "./admin-query-error";
import { attentionItems, type AttentionItem } from "./dashboard-logic";

const m = (amount: number, currency: Currency) => formatMoney({ amount, currency });
const dayLabel = (date: string) =>
  new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", timeZone: "UTC" }).format(new Date(`${date}T00:00:00Z`));

/**
 * The store at a glance (BS-12). What needs a person comes first; then money received (each
 * currency on its own), best sellers, how previews turn into orders, and customers. Every number
 * links to the page where it can be acted on.
 */
export function DashboardAdmin() {
  // New sales and messages refresh it live (RealtimeBridge); the interval catches the rest.
  const { data, isLoading, error, refetch } = useDashboardQuery(undefined, { pollingInterval: 120_000 });
  if (error) return <AdminQueryError error={error} onRetry={() => void refetch()} />;
  if (isLoading || !data) return <Skeleton className="h-96 w-full rounded-2xl" />;
  return (
    <div className="flex flex-col gap-10">
      <NeedsAttention items={attentionItems(data)} />
      <Revenue data={data} />
      <div className="grid gap-10 lg:grid-cols-2">
        <BestSellers data={data} />
        <Customers data={data} />
      </div>
      <Conversion data={data} />
    </div>
  );
}

const TONE_BAR: Record<AttentionItem["tone"], string> = {
  danger: "border-l-danger",
  warning: "border-l-warning",
  info: "border-l-info",
};

function NeedsAttention({ items }: { items: AttentionItem[] }) {
  if (!items.length) {
    return (
      <Card variant="sunken" className="flex items-center gap-3">
        <Icon icon={CheckCircle2} className="shrink-0 text-success" />
        <div>
          <h2 className="font-medium text-text">Nothing needs your attention</h2>
          <p className="text-sm text-text-muted">No payments to check, orders to ship, unanswered messages or failed emails.</p>
        </div>
      </Card>
    );
  }
  return (
    <section className="flex flex-col gap-3" aria-labelledby="attention-title">
      <div className="flex items-center gap-2">
        <h2 id="attention-title" className="text-2xl font-medium">
          Needs attention
        </h2>
        <Badge tone="danger">{items.length}</Badge>
      </div>
      <ul className="flex flex-col gap-2">
        {items.map((item) => (
          <li key={item.key}>
            <NextLink href={item.href} className="block rounded-2xl">
              <Card
                interactive
                padding="sm"
                className={`flex flex-col gap-2 border-l-4 sm:flex-row sm:items-center sm:justify-between sm:gap-4 ${TONE_BAR[item.tone]}`}
              >
                <div className="min-w-0">
                  <p className="font-medium text-text">{item.title}</p>
                  <p className="text-sm text-text-muted">{item.detail}</p>
                </div>
                <span className="inline-flex shrink-0 items-center gap-1 text-sm font-medium text-primary">
                  {item.action} <Icon icon={ArrowRight} size="sm" />
                </span>
              </Card>
            </NextLink>
          </li>
        ))}
      </ul>
    </section>
  );
}

function Revenue({ data }: { data: Dashboard }) {
  const { revenue: r } = data;
  const of = (list: CurrencyTotals[], c: Currency) => list.find((t) => t.currency === c);
  return (
    <section className="flex flex-col gap-3" aria-labelledby="revenue-title">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 id="revenue-title" className="text-2xl font-medium">
            Money received
          </h2>
          <p className="text-sm text-text-muted">Paid orders, Nigeria time. Each currency on its own; before payment fees and refunds.</p>
        </div>
        <ButtonLink href="/admin/reports" variant="ghost" size="sm">
          <Icon icon={BarChart3} size="sm" /> Full reports
        </ButtonLink>
      </div>
      {!r.month.length ? (
        <EmptyState icon={BarChart3} title="No sales in the last 30 days" description="Sales appear here as soon as a payment is confirmed." />
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {r.month.map((month) => {
            const c = month.currency;
            const days = r.daily.filter((d) => d.currency === c);
            return (
              <Card key={c} as="article" aria-labelledby={`rev-${c}`} className="flex flex-col gap-4">
                <h3 id={`rev-${c}`} className="text-lg font-medium">
                  {CURRENCY_LABEL[c]}
                </h3>
                {/* Phones: one row per period (amounts can be long). From `sm`: three columns. */}
                <dl className="flex flex-col divide-y divide-border sm:grid sm:grid-cols-3 sm:gap-3 sm:divide-y-0">
                  {(
                    [
                      ["Today", of(r.today, c)],
                      ["7 days", of(r.week, c)],
                      ["30 days", month],
                    ] as const
                  ).map(([label, t]) => (
                    <div key={label} className="grid min-w-0 grid-cols-[1fr_auto] items-baseline gap-x-3 py-2 sm:flex sm:flex-col sm:gap-0.5 sm:py-0">
                      <dt className="text-sm text-text-muted sm:text-xs sm:text-text-subtle">{label}</dt>
                      <dd className="text-right font-display text-lg font-medium tabular-nums sm:text-left sm:text-xl">{m(t?.received ?? 0, c)}</dd>
                      <dd className="col-span-2 text-right text-xs text-text-muted sm:text-left">
                        {t?.orders ?? 0} {t?.orders === 1 ? "order" : "orders"}
                      </dd>
                    </div>
                  ))}
                </dl>
                <BarChart
                  label={`${CURRENCY_LABEL[c]} received each day, last 30 days`}
                  bars={days.map((d) => ({ key: d.date, value: d.received, label: `${dayLabel(d.date)}: ${m(d.received, c)}` }))}
                  startLabel={days.length ? dayLabel(days[0].date) : undefined}
                  endLabel="Today"
                />
                {month.refunds > 0 && (
                  <p className="text-sm text-text-muted">
                    {m(month.refunds, c)} refunded on these orders · {m(month.net, c)} kept
                  </p>
                )}
              </Card>
            );
          })}
        </div>
      )}
    </section>
  );
}

function BestSellers({ data }: { data: Dashboard }) {
  return (
    <section className="flex flex-col gap-3" aria-labelledby="best-title">
      <h2 id="best-title" className="text-2xl font-medium">
        Best sellers <span className="text-base font-normal text-text-muted">· 30 days</span>
      </h2>
      {!data.bestSellers.length ? (
        <p className="text-text-muted">No books sold in the last 30 days.</p>
      ) : (
        <ol className="flex flex-col divide-y divide-border rounded-2xl border border-border bg-surface-raised">
          {data.bestSellers.map((b, i) => (
            <li key={b.bookId} className="flex items-start gap-3 p-4">
              <span className="w-6 shrink-0 font-display text-lg text-text-subtle tabular-nums">{i + 1}</span>
              <div className="min-w-0 flex-1">
                <NextLink href={`/admin/books/${b.bookId}`} className="font-medium text-text hover:text-primary">
                  {b.title}
                </NextLink>
                <p className="text-sm text-text-muted">
                  {b.copies} {b.copies === 1 ? "copy" : "copies"}
                  {b.ebookCopies > 0 && b.printCopies > 0 && ` · ${b.ebookCopies} ebook, ${b.printCopies} print`}
                  {b.ebookCopies > 0 && !b.printCopies && " · ebook"}
                  {b.printCopies > 0 && !b.ebookCopies && " · print"}
                </p>
              </div>
              <div className="flex shrink-0 flex-col items-end text-sm font-medium tabular-nums">
                {b.sales.map((s) => (
                  <span key={s.currency}>{m(s.amount, s.currency)}</span>
                ))}
              </div>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

function Customers({ data }: { data: Dashboard }) {
  const { total, newThisMonth } = data.customers;
  return (
    <section className="flex flex-col gap-3" aria-labelledby="customers-title">
      <h2 id="customers-title" className="text-2xl font-medium">
        Customers
      </h2>
      <Card className="flex flex-col gap-4">
        <dl className="grid grid-cols-2 gap-4">
          <div>
            <dt className="text-xs text-text-subtle">All customers</dt>
            <dd className="font-display text-3xl font-medium tabular-nums">{total}</dd>
          </div>
          <div>
            <dt className="text-xs text-text-subtle">New in 30 days</dt>
            <dd className="font-display text-3xl font-medium tabular-nums">{newThisMonth}</dd>
          </div>
        </dl>
        <p className="text-sm text-text-muted">Accounts and guest checkouts. See who bought what, and give a trusted person staff access.</p>
        <ButtonLink href="/admin/customers" variant="outline" className="self-start">
          <Icon icon={Users} size="sm" /> See customers
        </ButtonLink>
      </Card>
    </section>
  );
}

function Conversion({ data }: { data: Dashboard }) {
  const rows = data.conversion;
  return (
    <section className="flex min-w-0 flex-col gap-3" aria-labelledby="conversion-title">
      <div>
        <h2 id="conversion-title" className="text-2xl font-medium">
          From preview to purchase <span className="text-base font-normal text-text-muted">· 30 days</span>
        </h2>
        <p className="max-w-3xl text-sm text-text-muted">
          How many people opened each book’s free preview, read to its end or pressed Buy, and how many orders the book got. Some buyers
          never open the preview, so the last column is a guide, not an exact rate.
        </p>
      </div>
      {!rows.length ? (
        <p className="text-text-muted">No published books yet.</p>
      ) : (
        <>
          {/* Phones: one line per book. From `sm`: the full table. */}
          <ol className="flex flex-col divide-y divide-border rounded-2xl border border-border bg-surface-raised sm:hidden">
            {rows.map((r) => (
              <li key={r.bookId} className="flex flex-col gap-1 p-4">
                <NextLink href={`/books/${r.slug}`} className="font-medium text-text hover:text-primary">
                  {r.title}
                </NextLink>
                <p className="text-sm text-text-muted tabular-nums">
                  {r.readers} previewed · {r.finished} read to end · {r.buyClicks} pressed Buy · {r.orders} {r.orders === 1 ? "order" : "orders"}
                </p>
                {r.rate !== null && <p className="text-sm font-medium tabular-nums">{r.rate} orders per 100 previews</p>}
              </li>
            ))}
          </ol>
          <div className="hidden sm:block">
            <Table caption="Preview to purchase, last 30 days">
              <THead>
                <Tr>
                  <Th>Book</Th>
                  <Th numeric>Previewed</Th>
                  <Th numeric>Read to end</Th>
                  <Th numeric>Pressed Buy</Th>
                  <Th numeric>Orders</Th>
                  <Th numeric>Orders per 100 previews</Th>
                </Tr>
              </THead>
              <TBody>
                {rows.map((r) => (
                  <Tr key={r.bookId}>
                    <Td className="min-w-48">
                      <NextLink href={`/books/${r.slug}`} className="font-medium text-text hover:text-primary">
                        {r.title}
                      </NextLink>
                    </Td>
                    <Td numeric>{r.readers}</Td>
                    <Td numeric>{r.finished}</Td>
                    <Td numeric>{r.buyClicks}</Td>
                    <Td numeric>{r.orders}</Td>
                    <Td numeric className="font-semibold">
                      {r.rate === null ? "—" : r.rate}
                    </Td>
                  </Tr>
                ))}
              </TBody>
            </Table>
          </div>
        </>
      )}
    </section>
  );
}
