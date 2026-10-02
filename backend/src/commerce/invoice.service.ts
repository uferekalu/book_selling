import {
  ConflictException,
  Injectable,
  NotFoundException,
  type OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import type { Model } from 'mongoose';
import { toObjectId } from '../common/utils/object-id.js';
import { AttachmentRegistry } from '../mail/attachments.js';
import { buildInvoice, type InvoiceSeller } from './invoice.js';
import { isPaidLike } from './order-state-machine.js';
import { Order, type OrderDocument } from './schemas/order.schema.js';

/**
 * PDF invoices (PRODUCT_RULES §10): attached to the receipt when it is sent, and downloadable by
 * the buyer, a guest with their checkout key, and staff. Built on demand (small, fast), so a
 * refund shows on the next download.
 */
@Injectable()
export class InvoiceService implements OnModuleInit {
  private readonly seller: InvoiceSeller;

  constructor(
    @InjectModel(Order.name) private readonly orders: Model<Order>,
    private readonly attachments: AttachmentRegistry,
    config: ConfigService,
  ) {
    const website = (config.get<string>('FRONTEND_URL') ?? '').replace(
      /\/+$/,
      '',
    );
    this.seller = {
      name: config.get<string>('BRAND_NAME') || 'Engineering Books',
      address: config.get<string>('BUSINESS_POSTAL_ADDRESS') || null,
      email: config.get<string>('SUPPORT_EMAIL') || null,
      website: website.replace(/^https?:\/\//, '') || null,
    };
  }

  onModuleInit(): void {
    this.attachments.register('invoice', async (orderId) => {
      const order = await this.orders
        .findById(toObjectId(orderId, 'Order'))
        .exec();
      if (!order) throw new Error(`Order ${orderId} not found`);
      return {
        filename: filename(order),
        content: Buffer.from(await this.pdf(order)),
        contentType: 'application/pdf',
      };
    });
  }

  /** The invoice of a paid (or since refunded) order; unpaid orders have none. */
  async pdf(order: OrderDocument): Promise<Uint8Array> {
    if (!isPaidLike(order.status) || !order.payment) {
      throw new ConflictException(
        'The invoice is available once the order is paid.',
      );
    }
    return buildInvoice(order, this.seller);
  }

  async forOrderNumber(
    orderNumber: string,
  ): Promise<{ bytes: Uint8Array; filename: string }> {
    const order = await this.orders.findOne({ orderNumber }).exec();
    if (!order) throw new NotFoundException('Order not found');
    return { bytes: await this.pdf(order), filename: filename(order) };
  }
}

export function filename(order: Pick<Order, 'orderNumber'>): string {
  return `invoice-${order.orderNumber}.pdf`;
}
