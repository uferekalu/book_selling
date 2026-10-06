import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import type { Model, QueryFilter } from 'mongoose';
import { AuditLog } from '../audit/audit.module.js';
import { escapeRegex } from '../catalog/book-search.js';
import { LOW_STOCK } from '../catalog/catalog.presenter.js';
import { Book } from '../catalog/schemas/book.schema.js';
import type { Currency } from '../common/money/currency.js';
import { Order } from '../commerce/schemas/order.schema.js';
import { PROBLEM_FILTER } from '../mail/admin-emails.service.js';
import { EmailOutbox } from '../mail/schemas/email-outbox.schema.js';
import { ContactRequest } from '../messaging/schemas/contact-request.schema.js';
import { Conversation } from '../messaging/schemas/conversation.schema.js';
import { Payment } from '../payments/schemas/payment.schema.js';
import { PreviewEvent } from '../preview/preview-events.js';
import {
  dayStart,
  REPORT_TIME_ZONE,
  ReportsService,
} from '../reports/reports.service.js';
import { SALE_STATUSES } from '../reports/sales-report.js';
import { User } from '../users/schemas/user.schema.js';
import {
  bestSellers,
  conversion,
  CURRENCY_ORDER,
  dashboardWindows,
  lowStock,
  revenue,
  type PreviewActivity,
  type StockBook,
} from './dashboard.js';

/** Items listed per attention section; the count says when there are more. */
const ATTENTION_LIMIT = 20;
export const CUSTOMERS_PAGE = 25;
export const AUDIT_PAGE = 50;

const SHIPPING_FILTER: QueryFilter<Order> = {
  'shipment.status': { $in: ['pending', 'processing'] },
  status: { $in: ['paid', 'partially_refunded'] },
};

/**
 * The store dashboard, customers and audit log for staff (BS-12). Read-only: every action the
 * dashboard points to happens on the page it links to (orders, emails, messages, books).
 */
@Injectable()
export class AdminDashboardService {
  constructor(
    private readonly reports: ReportsService,
    @InjectModel(Order.name) private readonly orders: Model<Order>,
    @InjectModel(Payment.name) private readonly payments: Model<Payment>,
    @InjectModel(Book.name) private readonly books: Model<Book>,
    @InjectModel(User.name) private readonly users: Model<User>,
    @InjectModel(EmailOutbox.name) private readonly outbox: Model<EmailOutbox>,
    @InjectModel(Conversation.name)
    private readonly conversations: Model<Conversation>,
    @InjectModel(ContactRequest.name)
    private readonly contacts: Model<ContactRequest>,
    @InjectModel(PreviewEvent.name)
    private readonly previewEvents: Model<PreviewEvent>,
    @InjectModel(AuditLog.name) private readonly audit: Model<AuditLog>,
  ) {}

  async overview(now = new Date()) {
    const windows = dashboardWindows(now, REPORT_TIME_ZONE);
    const since = dayStart(windows.month.from, REPORT_TIME_ZONE);
    const [paid, books, activity, attention, customers] = await Promise.all([
      this.reports.paidOrders(windows.month),
      this.books
        .find(
          { status: 'published' },
          { title: 1, slug: 1, status: 1, formats: 1 },
        )
        .lean()
        .exec(),
      this.previewActivity(since),
      this.attention(),
      this.customerCounts(since),
    ]);
    return {
      timeZone: REPORT_TIME_ZONE,
      windows,
      attention,
      revenue: revenue(paid, now, REPORT_TIME_ZONE),
      bestSellers: bestSellers(paid),
      conversion: conversion(
        books.map((b) => ({
          id: b._id.toString(),
          title: b.title,
          slug: b.slug,
        })),
        activity,
        paid,
      ),
      lowStock: lowStock(books as unknown as StockBook[], LOW_STOCK),
      lowStockThreshold: LOW_STOCK,
      customers,
    };
  }

  /** Everything a person must look at, newest first. Empty sections mean nothing to do. */
  private async attention() {
    const [
      orders,
      orderCount,
      payments,
      paymentCount,
      emails,
      toShip,
      oldestToShip,
      unreadConversations,
      newContacts,
    ] = await Promise.all([
      this.orders
        .find(
          { 'attention.required': true },
          {
            orderNumber: 1,
            attention: 1,
            total: 1,
            currency: 1,
            updatedAt: 1,
          },
        )
        .sort({ updatedAt: -1 })
        .limit(ATTENTION_LIMIT)
        .lean()
        .exec(),
      this.orders.countDocuments({ 'attention.required': true }).exec(),
      this.payments
        .find(
          { reconciliationRequired: true },
          {
            orderId: 1,
            provider: 1,
            reference: 1,
            amount: 1,
            currency: 1,
            reconciliationReason: 1,
            updatedAt: 1,
          },
        )
        .sort({ updatedAt: -1 })
        .limit(ATTENTION_LIMIT)
        .lean()
        .exec(),
      this.payments.countDocuments({ reconciliationRequired: true }).exec(),
      this.outbox
        .countDocuments({ ...PROBLEM_FILTER, reviewedAt: null })
        .exec(),
      this.orders.countDocuments(SHIPPING_FILTER).exec(),
      this.orders
        .findOne(SHIPPING_FILTER, { orderNumber: 1, payment: 1, createdAt: 1 })
        .sort({ createdAt: 1 })
        .lean()
        .exec(),
      this.conversations.countDocuments({ 'unread.staff': { $gt: 0 } }).exec(),
      this.contacts.countDocuments({ status: 'new' }).exec(),
    ]);
    const paymentOrders = new Map(
      (
        await this.orders
          .find(
            { _id: { $in: payments.map((p) => p.orderId) } },
            { orderNumber: 1 },
          )
          .lean()
          .exec()
      ).map((o) => [o._id.toString(), o.orderNumber]),
    );
    const updatedAt = (row: unknown) =>
      ((row as { updatedAt?: Date }).updatedAt ?? null)?.toISOString() ?? null;
    return {
      orders: orders.map((o) => ({
        orderNumber: o.orderNumber,
        reason: o.attention.reason,
        total: o.total,
        currency: o.currency,
        at: updatedAt(o),
      })),
      orderCount,
      payments: payments.map((p) => ({
        orderNumber: paymentOrders.get(p.orderId.toString()) ?? null,
        provider: p.provider,
        reference: p.reference,
        amount: p.amount,
        currency: p.currency,
        reason: p.reconciliationReason ?? '',
        at: updatedAt(p),
      })),
      paymentCount,
      emailProblems: emails,
      toShip: {
        count: toShip,
        oldest: oldestToShip
          ? {
              orderNumber: oldestToShip.orderNumber,
              paidAt: (
                oldestToShip.payment?.paidAt ??
                (oldestToShip as unknown as { createdAt: Date }).createdAt
              ).toISOString(),
            }
          : null,
      },
      messages: { unreadConversations, newContacts },
    };
  }

  /** Per book: reading sessions that opened the preview, read to the end, pressed Buy. */
  private async previewActivity(since: Date): Promise<PreviewActivity[]> {
    const rows = await this.previewEvents
      .aggregate<{
        _id: unknown;
        readers: number;
        finished: number;
        buyClicks: number;
      }>([
        {
          $match: {
            at: { $gte: since },
            type: { $in: ['open', 'end_reached', 'buy_click'] },
          },
        },
        {
          $group: {
            _id: { book: '$bookId', session: '$sessionId' },
            types: { $addToSet: '$type' },
          },
        },
        {
          $group: {
            _id: '$_id.book',
            readers: { $sum: { $cond: [{ $in: ['open', '$types'] }, 1, 0] } },
            finished: {
              $sum: { $cond: [{ $in: ['end_reached', '$types'] }, 1, 0] },
            },
            buyClicks: {
              $sum: { $cond: [{ $in: ['buy_click', '$types'] }, 1, 0] },
            },
          },
        },
      ])
      .exec();
    return rows.map((r) => ({
      bookId: String(r._id),
      readers: r.readers,
      finished: r.finished,
      buyClicks: r.buyClicks,
    }));
  }

  private async customerCounts(since: Date) {
    const [total, newThisMonth] = await Promise.all([
      this.users.countDocuments({ role: 'customer' }).exec(),
      this.users
        .countDocuments({ role: 'customer', createdAt: { $gte: since } })
        .exec(),
    ]);
    return { total, newThisMonth };
  }

  /** Customers and staff, newest first, with what each has bought (per currency). */
  async customers(
    query: { q?: string; role?: 'customer' | 'staff' },
    page: number,
  ) {
    const filter: QueryFilter<User> =
      query.role === 'staff'
        ? { role: { $in: ['admin', 'owner'] } }
        : query.role === 'customer'
          ? { role: 'customer' }
          : {};
    const q = query.q?.trim();
    if (q) {
      const pattern = { $regex: escapeRegex(q), $options: 'i' };
      filter.$or = [{ name: pattern }, { email: pattern }];
    }
    const [users, total] = await Promise.all([
      this.users
        .find(filter, {
          name: 1,
          email: 1,
          role: 1,
          accountStatus: 1,
          emailVerifiedAt: 1,
          country: 1,
          lastLoginAt: 1,
          createdAt: 1,
          passwordHash: 1,
          'twoFactor.enabled': 1,
        })
        .select('+passwordHash')
        .sort({ createdAt: -1 })
        .skip((page - 1) * CUSTOMERS_PAGE)
        .limit(CUSTOMERS_PAGE)
        .lean()
        .exec(),
      this.users.countDocuments(filter).exec(),
    ]);
    const spend = await this.orders
      .aggregate<{
        _id: { user: unknown; currency: Currency };
        orders: number;
        paid: number;
        refunded: number;
        lastPaidAt: Date;
      }>([
        {
          $match: {
            userId: { $in: users.map((u) => u._id) },
            status: { $in: [...SALE_STATUSES] },
          },
        },
        {
          $group: {
            _id: { user: '$userId', currency: '$currency' },
            orders: { $sum: 1 },
            paid: { $sum: '$total' },
            refunded: { $sum: '$refundedTotal' },
            lastPaidAt: { $max: '$payment.paidAt' },
          },
        },
      ])
      .exec();
    const byUser = new Map<string, typeof spend>();
    for (const row of spend) {
      const key = String(row._id.user);
      byUser.set(key, [...(byUser.get(key) ?? []), row]);
    }
    return {
      items: users.map((u) => {
        const rows = byUser.get(u._id.toString()) ?? [];
        const last = rows.reduce<Date | null>(
          (latest, r) =>
            r.lastPaidAt && (!latest || r.lastPaidAt > latest)
              ? r.lastPaidAt
              : latest,
          null,
        );
        return {
          id: u._id.toString(),
          name: u.name,
          email: u.email,
          role: u.role,
          accountStatus: u.accountStatus,
          /** A guest checkout that never set a password. */
          guest: !u.passwordHash,
          emailVerified: Boolean(u.emailVerifiedAt),
          twoFactor: Boolean(u.twoFactor?.enabled),
          country: u.country ?? null,
          joinedAt: (
            u as unknown as { createdAt: Date }
          ).createdAt.toISOString(),
          lastLoginAt: u.lastLoginAt?.toISOString() ?? null,
          orders: rows.reduce((n, r) => n + r.orders, 0),
          lastOrderAt: last?.toISOString() ?? null,
          spent: rows
            .map((r) => ({
              currency: r._id.currency,
              amount: r.paid - r.refunded,
            }))
            .sort(
              (a, b) =>
                CURRENCY_ORDER.indexOf(a.currency) -
                CURRENCY_ORDER.indexOf(b.currency),
            ),
        };
      }),
      total,
      page,
      pageSize: CUSTOMERS_PAGE,
    };
  }

  /** The audit log, newest first, with who did it and what it was about in words. */
  async auditLog(query: { entityType?: string; q?: string }, page: number) {
    const filter: QueryFilter<AuditLog> = {};
    if (query.entityType) filter.entityType = query.entityType;
    const q = query.q?.trim();
    if (q) filter.action = { $regex: escapeRegex(q), $options: 'i' };
    const [rows, total, entityTypes] = await Promise.all([
      this.audit
        .find(filter)
        .sort({ at: -1, _id: -1 })
        .skip((page - 1) * AUDIT_PAGE)
        .limit(AUDIT_PAGE)
        .lean()
        .exec(),
      this.audit.countDocuments(filter).exec(),
      this.audit.distinct('entityType').exec(),
    ]);
    const ids = (type: string) =>
      [
        ...new Set(
          rows.filter((r) => r.entityType === type).map((r) => r.entityId),
        ),
      ].filter((id) => /^[a-f0-9]{24}$/.test(id));
    const actorIds = [
      ...new Set(rows.map((r) => r.actorId).filter((id): id is string => !!id)),
    ].filter((id) => /^[a-f0-9]{24}$/.test(id));
    const [actors, orders, books, users] = await Promise.all([
      this.users
        .find({ _id: { $in: actorIds } }, { name: 1, email: 1 })
        .lean()
        .exec(),
      this.orders
        .find({ _id: { $in: ids('order') } }, { orderNumber: 1 })
        .lean()
        .exec(),
      this.books
        .find({ _id: { $in: ids('book') } }, { title: 1 })
        .lean()
        .exec(),
      this.users
        .find({ _id: { $in: ids('user') } }, { name: 1, email: 1 })
        .lean()
        .exec(),
    ]);
    const actorOf = new Map(actors.map((a) => [a._id.toString(), a]));
    const label = new Map<string, { label: string; href: string | null }>([
      ...orders.map(
        (o) =>
          [
            `order:${o._id.toString()}`,
            {
              label: o.orderNumber,
              href: `/admin/orders/${o.orderNumber}`,
            },
          ] as const,
      ),
      ...books.map(
        (b) =>
          [
            `book:${b._id.toString()}`,
            { label: b.title, href: `/admin/books/${b._id.toString()}` },
          ] as const,
      ),
      ...users.map(
        (u) =>
          [
            `user:${u._id.toString()}`,
            { label: `${u.name} (${u.email})`, href: null },
          ] as const,
      ),
    ]);
    return {
      items: rows.map((r) => {
        const actor = r.actorId ? actorOf.get(r.actorId) : undefined;
        const entity = label.get(`${r.entityType}:${r.entityId}`);
        return {
          id: r._id.toString(),
          at: (r as unknown as { at: Date }).at.toISOString(),
          action: r.action,
          actor: r.actorId
            ? {
                id: r.actorId,
                role: r.actorRole,
                name: actor?.name ?? null,
                email: actor?.email ?? null,
              }
            : null,
          entityType: r.entityType,
          entityId: r.entityId,
          entityLabel: entity?.label ?? null,
          entityHref: entity?.href ?? null,
          changes: r.changes ?? null,
          ip: r.ip ?? null,
        };
      }),
      total,
      page,
      pageSize: AUDIT_PAGE,
      entityTypes: entityTypes.sort(),
    };
  }
}
