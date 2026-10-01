import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Types, type ClientSession, type Model } from 'mongoose';
import type { Currency } from '../common/money/currency.js';
import { isObjectId } from '../common/utils/object-id.js';
import { Book, type FormatType } from '../catalog/schemas/book.schema.js';
import { CloudinaryService } from '../uploads/cloudinary.service.js';
import { User } from '../users/schemas/user.schema.js';
import { normaliseEmail } from '../users/users.service.js';
import { CouponsService } from './coupons.service.js';
import { priceCart, type PricingBook, type Quote } from './pricing.js';
import { Entitlement } from './schemas/entitlement.schema.js';
import { ShippingService } from './shipping.service.js';

export interface QuoteRequest {
  currency: Currency;
  items: Array<{ bookId: string; format: FormatType; quantity: number }>;
  /** The signed-in buyer, or null for a guest. */
  userId: string | null;
  /** A guest's email (finds their account's library and coupon uses). */
  email: string | null;
  shippingCountry: string | null;
  couponCode: string | null;
  now?: Date;
  session?: ClientSession;
}

/** Loads everything `priceCart` needs from the database, then prices (ARCHITECTURE §8.2). */
@Injectable()
export class PricingService {
  constructor(
    @InjectModel(Book.name) private readonly books: Model<Book>,
    @InjectModel(Entitlement.name)
    private readonly entitlements: Model<Entitlement>,
    @InjectModel(User.name) private readonly users: Model<User>,
    private readonly shipping: ShippingService,
    private readonly coupons: CouponsService,
    private readonly media: CloudinaryService,
  ) {}

  async quote(request: QuoteRequest): Promise<Quote> {
    const { session } = request;
    const ids = [
      ...new Set(
        request.items.map((i) => i.bookId).filter((id) => isObjectId(id)),
      ),
    ];
    const docs = await this.books
      .find(
        { _id: { $in: ids.map((id) => new Types.ObjectId(id)) } },
        { title: 1, slug: 1, cover: 1, status: 1, formats: 1 },
      )
      .session(session ?? null)
      .lean()
      .exec();
    const books = new Map<string, PricingBook>(
      docs.map((doc) => [
        doc._id.toString(),
        {
          id: doc._id.toString(),
          slug: doc.slug,
          title: doc.title,
          cover: doc.cover
            ? this.media.imageUrl(
                doc.cover.publicId,
                doc.cover.version,
                doc.cover.crop,
              )
            : null,
          published: doc.status === 'published',
          formats: doc.formats.map((f) => ({
            type: f.type,
            sku: f.sku,
            active: f.active,
            prices: f.prices,
            compareAtPrices: f.compareAtPrices ?? [],
            print: f.print
              ? {
                  stockOnHand: f.print.stockOnHand,
                  stockReserved: f.print.stockReserved,
                  maxPerOrder: f.print.maxPerOrder,
                }
              : null,
          })),
        },
      ]),
    );

    const ownerId = await this.ownerId(request);
    const ebookIds = request.items
      .filter((i) => i.format === 'ebook' && isObjectId(i.bookId))
      .map((i) => new Types.ObjectId(i.bookId));
    const owned =
      ownerId && ebookIds.length
        ? await this.entitlements
            .find(
              { userId: ownerId, bookId: { $in: ebookIds }, revokedAt: null },
              { bookId: 1 },
            )
            .session(session ?? null)
            .lean()
            .exec()
        : [];

    const zone = request.shippingCountry
      ? await this.shipping.zoneFor(request.shippingCountry)
      : null;

    let coupon: Parameters<typeof priceCart>[0]['coupon'] = null;
    if (request.couponCode?.trim()) {
      const found = await this.coupons.findByCode(request.couponCode);
      const email = request.email ?? (await this.emailOf(request.userId));
      coupon = {
        code: request.couponCode.trim().toUpperCase(),
        found,
        customerUses:
          found && email
            ? await this.coupons.customerUses(found.id, email, session)
            : null,
      };
    }

    return priceCart({
      currency: request.currency,
      items: request.items,
      books,
      ownedBookIds: new Set(owned.map((e) => e.bookId.toString())),
      shippingCountry: request.shippingCountry,
      zone,
      coupon,
      now: request.now ?? new Date(),
    });
  }

  private async ownerId(request: QuoteRequest): Promise<Types.ObjectId | null> {
    if (request.userId) return new Types.ObjectId(request.userId);
    if (!request.email) return null;
    const user = await this.users
      .findOne({ email: normaliseEmail(request.email) }, { _id: 1 })
      .session(request.session ?? null)
      .lean()
      .exec();
    return user?._id ?? null;
  }

  private async emailOf(userId: string | null): Promise<string | null> {
    if (!userId) return null;
    const user = await this.users.findById(userId, { email: 1 }).lean().exec();
    return user?.email ?? null;
  }
}
