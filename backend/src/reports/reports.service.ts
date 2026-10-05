import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import type { Model, QueryFilter } from 'mongoose';
import type { Currency } from '../common/money/currency.js';
import { Order } from '../commerce/schemas/order.schema.js';
import {
  earnings,
  saleRows,
  salesCsv,
  SALE_STATUSES,
  type EarningsReport,
  type Grouping,
  type ReportOrder,
  type SaleRow,
} from './sales-report.js';

/** Reports read dates and group periods in the owner's time zone (Nigeria, UTC+1, no DST). */
export const REPORT_TIME_ZONE = 'Africa/Lagos';
/** A report that would read more orders than this asks for a shorter date range. */
export const MAX_REPORT_ORDERS = 20_000;
export const SALES_PAGE = 50;

export interface ReportRange {
  /** Inclusive calendar dates (YYYY-MM-DD) in REPORT_TIME_ZONE. */
  from: string;
  to: string;
}

export interface SalesFilters extends ReportRange {
  currency?: Currency;
  format?: 'ebook' | 'print';
  country?: string;
  /** 'instant' (ebooks) or a shipment status. */
  delivery?: string;
  /** Matches the book title, buyer name or email, or the order number. */
  q?: string;
}

/** Milliseconds a time zone is ahead of UTC at a given instant. */
function offsetMs(at: number, timeZone: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(new Date(at));
  const get = (type: string) =>
    Number(parts.find((p) => p.type === type)!.value);
  const asUtc = Date.UTC(
    get('year'),
    get('month') - 1,
    get('day'),
    get('hour'),
    get('minute'),
    get('second'),
  );
  return asUtc - at;
}

/** The instant a calendar day starts in a time zone. */
export function dayStart(date: string, timeZone: string): Date {
  const [y, m, d] = date.split('-').map(Number);
  const guess = Date.UTC(y, m - 1, d);
  // Twice, so a day whose offset changes (summer time) still lands on local midnight.
  const first = guess - offsetMs(guess, timeZone);
  return new Date(guess - offsetMs(first, timeZone));
}

function nextDay(date: string): string {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + 1)).toISOString().slice(0, 10);
}

/**
 * Sales and earnings for the owner (BS-29). A sale is an order that was paid: paid, fulfilled,
 * partly or fully refunded. It is counted on the day it was paid.
 */
@Injectable()
export class ReportsService {
  constructor(@InjectModel(Order.name) private readonly orders: Model<Order>) {}

  private async paidOrders(
    range: ReportRange,
    currency?: Currency,
  ): Promise<ReportOrder[]> {
    for (const date of [range.from, range.to]) {
      const [y, m, d] = date.split('-').map(Number);
      // 2026-02-31 rolls over to 3 March: not a real date.
      if (new Date(Date.UTC(y, m - 1, d)).toISOString().slice(0, 10) !== date) {
        throw new BadRequestException(`${date} is not a real date`);
      }
    }
    if (range.from > range.to) {
      throw new BadRequestException('The start date is after the end date');
    }
    const filter: QueryFilter<Order> = {
      status: { $in: [...SALE_STATUSES] },
      'payment.paidAt': {
        $gte: dayStart(range.from, REPORT_TIME_ZONE),
        $lt: dayStart(nextDay(range.to), REPORT_TIME_ZONE),
      },
      ...(currency ? { currency } : {}),
    };
    const rows = await this.orders
      .find(filter, {
        orderNumber: 1,
        email: 1,
        customerName: 1,
        currency: 1,
        status: 1,
        country: 1,
        shippingAddress: 1,
        items: 1,
        subtotal: 1,
        discountTotal: 1,
        shippingTotal: 1,
        taxTotal: 1,
        total: 1,
        refundedTotal: 1,
        coupon: 1,
        payment: 1,
        shipment: 1,
      })
      .sort({ 'payment.paidAt': -1 })
      .limit(MAX_REPORT_ORDERS + 1)
      .lean<ReportOrder[]>()
      .exec();
    if (rows.length > MAX_REPORT_ORDERS) {
      throw new BadRequestException(
        `More than ${MAX_REPORT_ORDERS.toLocaleString('en')} orders in this range; choose a shorter period.`,
      );
    }
    return rows;
  }

  private async filteredRows(filters: SalesFilters): Promise<SaleRow[]> {
    const q = filters.q?.trim().toLowerCase();
    const country = filters.country?.toUpperCase();
    return saleRows(await this.paidOrders(filters, filters.currency)).filter(
      (r) =>
        (!filters.format || r.format === filters.format) &&
        (!country || r.country === country) &&
        (!filters.delivery || r.delivery === filters.delivery) &&
        (!q ||
          r.title.toLowerCase().includes(q) ||
          r.buyerName.toLowerCase().includes(q) ||
          r.buyerEmail.includes(q) ||
          r.orderNumber.toLowerCase().includes(q)),
    );
  }

  async sales(
    filters: SalesFilters,
    page: number,
  ): Promise<{
    rows: SaleRow[];
    total: number;
    page: number;
    pageSize: number;
    timeZone: string;
    /** Per-currency sums of the filtered rows, for the footer. */
    sums: Array<{
      currency: Currency;
      copies: number;
      lineTotal: number;
      discount: number;
      lineNet: number;
    }>;
  }> {
    const rows = await this.filteredRows(filters);
    const sums = new Map<
      Currency,
      {
        currency: Currency;
        copies: number;
        lineTotal: number;
        discount: number;
        lineNet: number;
      }
    >();
    for (const r of rows) {
      const s = sums.get(r.currency) ?? {
        currency: r.currency,
        copies: 0,
        lineTotal: 0,
        discount: 0,
        lineNet: 0,
      };
      s.copies += r.quantity;
      s.lineTotal += r.lineTotal;
      s.discount += r.discount;
      s.lineNet += r.lineNet;
      sums.set(r.currency, s);
    }
    const order: Currency[] = ['NGN', 'USD', 'GBP', 'EUR'];
    return {
      rows: rows.slice((page - 1) * SALES_PAGE, page * SALES_PAGE),
      total: rows.length,
      page,
      pageSize: SALES_PAGE,
      timeZone: REPORT_TIME_ZONE,
      sums: [...sums.values()].sort(
        (a, b) => order.indexOf(a.currency) - order.indexOf(b.currency),
      ),
    };
  }

  async salesCsv(filters: SalesFilters): Promise<string> {
    return salesCsv(await this.filteredRows(filters), REPORT_TIME_ZONE);
  }

  async earnings(
    range: ReportRange,
    grouping: Grouping,
  ): Promise<EarningsReport & { timeZone: string; grouping: Grouping }> {
    return {
      ...earnings(await this.paidOrders(range), grouping, REPORT_TIME_ZONE),
      timeZone: REPORT_TIME_ZONE,
      grouping,
    };
  }
}
