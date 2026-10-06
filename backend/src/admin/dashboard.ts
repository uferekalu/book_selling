import type { Currency } from '../common/money/currency.js';
import {
  earnings,
  type CurrencyTotals,
  type ReportOrder,
} from '../reports/sales-report.js';

/**
 * The owner's dashboard (BS-12): pure calculations over rows the service has already read, so
 * they are unit-tested without a database. Money stays per currency; nothing is ever summed
 * across currencies.
 */

export const CURRENCY_ORDER: Currency[] = ['NGN', 'USD', 'GBP', 'EUR'];
const byCurrency = (a: { currency: Currency }, b: { currency: Currency }) =>
  CURRENCY_ORDER.indexOf(a.currency) - CURRENCY_ORDER.indexOf(b.currency);

/** Calendar date (YYYY-MM-DD) of an instant in a time zone. */
export function localDate(at: Date, timeZone: string): string {
  // en-CA formats dates as YYYY-MM-DD.
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(at);
}

/** The calendar date `days` before `date` (YYYY-MM-DD). */
export function daysBefore(date: string, days: number): string {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d - days)).toISOString().slice(0, 10);
}

/** Today, the last 7 days and the last 30 days, each ending today (inclusive). */
export function dashboardWindows(now: Date, timeZone: string) {
  const today = localDate(now, timeZone);
  return {
    today: { from: today, to: today },
    week: { from: daysBefore(today, 6), to: today },
    month: { from: daysBefore(today, 29), to: today },
  };
}

export interface Revenue {
  today: CurrencyTotals[];
  week: CurrencyTotals[];
  month: CurrencyTotals[];
  /** One entry per day of the last 30 days and currency sold in (zero days included). */
  daily: Array<{ date: string; currency: Currency; received: number }>;
}

/** Revenue for the three windows from the last 30 days of paid orders. */
export function revenue(
  orders: ReportOrder[],
  now: Date,
  timeZone: string,
): Revenue {
  const w = dashboardWindows(now, timeZone);
  const paidOn = (o: ReportOrder) =>
    o.payment ? localDate(o.payment.paidAt, timeZone) : '';
  const within = (range: { from: string; to: string }) =>
    orders.filter((o) => {
      const d = paidOn(o);
      return d >= range.from && d <= range.to;
    });
  const totals = (list: ReportOrder[]) =>
    earnings(list, 'day', timeZone).totals.sort(byCurrency);

  const month = within(w.month);
  const report = earnings(month, 'day', timeZone);
  const currencies = report.totals
    .map((t) => t.currency)
    .sort((a, b) => CURRENCY_ORDER.indexOf(a) - CURRENCY_ORDER.indexOf(b));
  const received = new Map(
    report.periods.map((p) => [`${p.period}|${p.currency}`, p.received]),
  );
  const daily: Revenue['daily'] = [];
  for (let i = 29; i >= 0; i--) {
    const date = daysBefore(w.month.to, i);
    for (const currency of currencies) {
      daily.push({
        date,
        currency,
        received: received.get(`${date}|${currency}`) ?? 0,
      });
    }
  }
  return {
    today: totals(within(w.today)),
    week: totals(within(w.week)),
    month: report.totals.sort(byCurrency),
    daily,
  };
}

export interface BestSeller {
  bookId: string;
  title: string;
  copies: number;
  ebookCopies: number;
  printCopies: number;
  /** Net sales (after discounts) per currency. */
  sales: Array<{ currency: Currency; amount: number }>;
}

/** Books by copies sold (all currencies together; money stays per currency). */
export function bestSellers(orders: ReportOrder[], limit = 5): BestSeller[] {
  const rows = new Map<string, BestSeller>();
  for (const book of earnings(orders, 'month', 'UTC').books) {
    const row = rows.get(book.bookId) ?? {
      bookId: book.bookId,
      title: book.title,
      copies: 0,
      ebookCopies: 0,
      printCopies: 0,
      sales: [],
    };
    row.ebookCopies += book.ebookCopies;
    row.printCopies += book.printCopies;
    row.copies += book.ebookCopies + book.printCopies;
    row.sales.push({ currency: book.currency, amount: book.net });
    rows.set(book.bookId, row);
  }
  return [...rows.values()]
    .map((r) => ({ ...r, sales: r.sales.sort(byCurrency) }))
    .sort((a, b) => b.copies - a.copies || a.title.localeCompare(b.title))
    .slice(0, limit);
}

export interface PreviewActivity {
  bookId: string;
  /** Reading sessions that opened the preview. */
  readers: number;
  /** Sessions that read to the end of the preview. */
  finished: number;
  /** Sessions that pressed a Buy button in the reader. */
  buyClicks: number;
}

export interface ConversionRow extends PreviewActivity {
  title: string;
  slug: string;
  /** Paid orders that include the book (any format). */
  orders: number;
  /** orders ÷ readers as a whole percentage, null when nobody opened the preview. */
  rate: number | null;
}

/**
 * Preview → purchase per published book. Not every buyer reads the preview first, so the rate is
 * a guide, and it can pass 100% for a book people buy without previewing.
 */
export function conversion(
  books: Array<{ id: string; title: string; slug: string }>,
  activity: PreviewActivity[],
  orders: ReportOrder[],
): ConversionRow[] {
  const seen = new Map(activity.map((a) => [a.bookId, a]));
  const bought = new Map<string, number>();
  for (const order of orders) {
    for (const id of new Set(order.items.map((i) => i.bookId.toString()))) {
      bought.set(id, (bought.get(id) ?? 0) + 1);
    }
  }
  return books
    .map((book) => {
      const a = seen.get(book.id);
      const readers = a?.readers ?? 0;
      const ordersFor = bought.get(book.id) ?? 0;
      return {
        bookId: book.id,
        title: book.title,
        slug: book.slug,
        readers,
        finished: a?.finished ?? 0,
        buyClicks: a?.buyClicks ?? 0,
        orders: ordersFor,
        rate: readers ? Math.round((ordersFor / readers) * 100) : null,
      };
    })
    .sort(
      (a, b) =>
        b.readers - a.readers ||
        b.orders - a.orders ||
        a.title.localeCompare(b.title),
    );
}

export interface StockBook {
  _id: { toString(): string };
  title: string;
  status: string;
  formats: Array<{
    type: string;
    active: boolean;
    print: { stockOnHand: number; stockReserved: number } | null;
  }>;
}

/** Published books whose active print copy has `threshold` or fewer copies free to sell. */
export function lowStock(
  books: StockBook[],
  threshold: number,
): Array<{ bookId: string; title: string; left: number; reserved: number }> {
  const rows: Array<{
    bookId: string;
    title: string;
    left: number;
    reserved: number;
  }> = [];
  for (const book of books) {
    if (book.status !== 'published') continue;
    for (const f of book.formats) {
      if (f.type !== 'print' || !f.active) continue;
      const onHand = f.print?.stockOnHand ?? 0;
      const reserved = f.print?.stockReserved ?? 0;
      const left = Math.max(0, onHand - reserved);
      if (left <= threshold) {
        rows.push({
          bookId: book._id.toString(),
          title: book.title,
          left,
          reserved,
        });
      }
    }
  }
  return rows.sort((a, b) => a.left - b.left || a.title.localeCompare(b.title));
}
