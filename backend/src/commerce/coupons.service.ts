import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Types, type ClientSession, type Model } from 'mongoose';
import { AuditService } from '../audit/audit.module.js';
import type { AccessTokenPayload } from '../auth/interfaces/auth.types.js';
import type { Currency } from '../common/money/currency.js';
import { toObjectId } from '../common/utils/object-id.js';
import type { FormatType } from '../catalog/schemas/book.schema.js';
import { normaliseCode, type CouponLike } from './coupon-rules.js';
import {
  Coupon,
  CouponRedemption,
  type CouponDocument,
  type CouponKind,
} from './schemas/coupon.schema.js';

export interface CouponInput {
  code: string;
  description?: string;
  kind: CouponKind;
  percentOff?: number | null;
  amountsOff?: Array<{ currency: Currency; amount: number }>;
  minSubtotals?: Array<{ currency: Currency; amount: number }>;
  appliesTo?: { bookIds?: string[]; formats?: FormatType[] };
  startsAt?: string | null;
  endsAt?: string | null;
  maxRedemptions?: number | null;
  perCustomerLimit?: number | null;
  active?: boolean;
}

/** Coupon storage, holds and releases (the rules themselves are in coupon-rules.ts). */
@Injectable()
export class CouponsService {
  constructor(
    @InjectModel(Coupon.name) private readonly coupons: Model<Coupon>,
    @InjectModel(CouponRedemption.name)
    private readonly redemptions: Model<CouponRedemption>,
    private readonly audit: AuditService,
  ) {}

  async findByCode(code: string): Promise<CouponLike | null> {
    const coupon = await this.coupons
      .findOne({ code: normaliseCode(code) })
      .exec();
    return coupon ? toCouponLike(coupon) : null;
  }

  /** This customer's held or used redemptions of a coupon. */
  customerUses(
    couponId: string,
    email: string,
    session?: ClientSession,
  ): Promise<number> {
    return this.redemptions
      .countDocuments({
        couponId: toObjectId(couponId),
        email: email.toLowerCase(),
        status: { $in: ['reserved', 'redeemed'] },
      })
      .session(session ?? null)
      .exec();
  }

  /**
   * Holds one use of the coupon for an order, inside the order transaction. The conditional
   * increment means the last available use can't be taken twice by concurrent checkouts.
   */
  async reserve(
    couponId: string,
    order: { orderId: Types.ObjectId; email: string; userId: Types.ObjectId },
    session: ClientSession,
  ): Promise<boolean> {
    const taken = await this.coupons
      .updateOne(
        {
          _id: toObjectId(couponId),
          active: true,
          $or: [
            { maxRedemptions: null },
            { $expr: { $lt: ['$redemptionCount', '$maxRedemptions'] } },
          ],
        },
        { $inc: { redemptionCount: 1 } },
        { session },
      )
      .exec();
    if (taken.modifiedCount !== 1) return false;
    await this.redemptions.create(
      [
        {
          couponId: toObjectId(couponId),
          orderId: order.orderId,
          email: order.email.toLowerCase(),
          userId: order.userId,
          status: 'reserved',
        },
      ],
      { session },
    );
    return true;
  }

  /** Gives a held use back (order expired or cancelled). Runs once: guarded by the status. */
  async release(
    orderId: Types.ObjectId,
    session: ClientSession,
  ): Promise<void> {
    const redemption = await this.redemptions
      .findOneAndUpdate(
        { orderId, status: 'reserved' },
        { $set: { status: 'released' } },
        { session, returnDocument: 'after' },
      )
      .exec();
    if (redemption) {
      await this.coupons
        .updateOne(
          { _id: redemption.couponId, redemptionCount: { $gt: 0 } },
          { $inc: { redemptionCount: -1 } },
          { session },
        )
        .exec();
    }
  }

  // ---- admin -----------------------------------------------------------------------------

  list(): Promise<CouponDocument[]> {
    return this.coupons.find().sort({ createdAt: -1 }).exec();
  }

  async create(
    input: CouponInput,
    actor: AccessTokenPayload,
  ): Promise<CouponDocument> {
    const data = this.clean(input);
    if (await this.coupons.exists({ code: data.code })) {
      throw new ConflictException(`The code ${data.code} already exists`);
    }
    const coupon = await this.coupons.create(data);
    await this.record(actor, 'coupon.created', coupon);
    return coupon;
  }

  async update(
    id: string,
    input: CouponInput,
    actor: AccessTokenPayload,
  ): Promise<CouponDocument> {
    const coupon = await this.coupons.findById(toObjectId(id, 'Coupon')).exec();
    if (!coupon) throw new NotFoundException('Coupon not found');
    const data = this.clean(input);
    if (
      data.code !== coupon.code &&
      (await this.coupons.exists({ code: data.code }))
    ) {
      throw new ConflictException(`The code ${data.code} already exists`);
    }
    coupon.set(data);
    await coupon.save();
    await this.record(actor, 'coupon.updated', coupon);
    return coupon;
  }

  private clean(input: CouponInput) {
    const code = normaliseCode(input.code);
    if (!/^[A-Z0-9_-]{3,30}$/.test(code)) {
      throw new BadRequestException(
        'Codes are 3–30 letters, numbers, hyphens or underscores',
      );
    }
    if (input.kind === 'percent' && !input.percentOff) {
      throw new BadRequestException('Set the percentage off');
    }
    if (
      input.kind === 'fixed' &&
      !input.amountsOff?.some((a) => a.amount > 0)
    ) {
      throw new BadRequestException(
        'Set the amount off in at least one currency',
      );
    }
    const startsAt = input.startsAt ? new Date(input.startsAt) : null;
    const endsAt = input.endsAt ? new Date(input.endsAt) : null;
    if (startsAt && endsAt && startsAt >= endsAt) {
      throw new BadRequestException('The code ends before it starts');
    }
    return {
      code,
      description: input.description?.trim() ?? '',
      kind: input.kind,
      percentOff: input.kind === 'percent' ? (input.percentOff ?? null) : null,
      amountsOff: input.kind === 'fixed' ? (input.amountsOff ?? []) : [],
      minSubtotals: input.minSubtotals ?? [],
      appliesTo: {
        bookIds: (input.appliesTo?.bookIds ?? []).map((id) =>
          toObjectId(id, 'Book'),
        ),
        formats: input.appliesTo?.formats ?? [],
      },
      startsAt,
      endsAt,
      maxRedemptions: input.maxRedemptions ?? null,
      perCustomerLimit: input.perCustomerLimit ?? null,
      active: input.active ?? true,
    };
  }

  private async record(
    actor: AccessTokenPayload,
    action: string,
    coupon: CouponDocument,
  ) {
    await this.audit.record({
      actor: { id: actor.sub, role: actor.role },
      action,
      entityType: 'coupon',
      entityId: coupon._id.toString(),
      changes: { code: coupon.code, kind: coupon.kind, active: coupon.active },
    });
  }
}

export function toCouponLike(coupon: CouponDocument): CouponLike {
  return {
    id: coupon._id.toString(),
    code: coupon.code,
    kind: coupon.kind,
    percentOff: coupon.percentOff,
    amountsOff: coupon.amountsOff.map((a) => ({
      currency: a.currency,
      amount: a.amount,
    })),
    minSubtotals: coupon.minSubtotals.map((a) => ({
      currency: a.currency,
      amount: a.amount,
    })),
    appliesTo: {
      bookIds: coupon.appliesTo.bookIds.map((id) => id.toString()),
      formats: coupon.appliesTo.formats,
    },
    startsAt: coupon.startsAt,
    endsAt: coupon.endsAt,
    maxRedemptions: coupon.maxRedemptions,
    perCustomerLimit: coupon.perCustomerLimit,
    redemptionCount: coupon.redemptionCount,
    active: coupon.active,
  };
}
