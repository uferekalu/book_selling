import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectConnection, InjectModel } from '@nestjs/mongoose';
import type { ClientSession, Connection, Model } from 'mongoose';
import { AuditService } from '../audit/audit.module.js';
import type { AccessTokenPayload } from '../auth/interfaces/auth.types.js';
import { MailService } from '../mail/mail.service.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { countryName } from '../payments/countries.js';
import { nextStatus } from './order-state-machine.js';
import {
  Order,
  type OrderDocument,
  type OrderStatus,
  type ShipmentStatus,
} from './schemas/order.schema.js';

export const SHIPMENT_ACTIONS = ['processing', 'shipped', 'delivered'] as const;
export type ShipmentAction = (typeof SHIPMENT_ACTIONS)[number];

export interface ShipmentUpdate {
  status: ShipmentAction;
  carrier?: string;
  trackingNumber?: string;
  trackingUrl?: string;
}

/**
 * Which shipment status each step may start from (PRODUCT_RULES §8: Processing → Shipped →
 * Delivered). Skipping "processing" is allowed; "shipped → shipped" corrects tracking details
 * without emailing the buyer again.
 */
const FROM: Record<ShipmentAction, ShipmentStatus[]> = {
  processing: ['pending'],
  shipped: ['pending', 'processing', 'shipped'],
  delivered: ['shipped'],
};

/** Orders whose print copies may move: paid ones, not fully refunded or unpaid. */
const SHIPPABLE: OrderStatus[] = ['paid', 'fulfilled', 'partially_refunded'];

/**
 * Print fulfilment (ARCHITECTURE §10.4). Each step is a conditional update on the current
 * shipment status (two staff members can't both apply it), in one transaction with the buyer's
 * email; delivery also marks a paid order fulfilled.
 */
@Injectable()
export class ShipmentsService {
  private readonly logger = new Logger(ShipmentsService.name);
  private readonly frontendUrl: string;

  constructor(
    @InjectModel(Order.name) private readonly orders: Model<Order>,
    @InjectConnection() private readonly connection: Connection,
    private readonly mail: MailService,
    private readonly notifications: NotificationsService,
    private readonly audit: AuditService,
    config: ConfigService,
  ) {
    this.frontendUrl = (config.get<string>('FRONTEND_URL') ?? '').replace(
      /\/+$/,
      '',
    );
  }

  async update(
    orderNumber: string,
    change: ShipmentUpdate,
    actor: AccessTokenPayload,
  ): Promise<OrderDocument> {
    const order = await this.orders.findOne({ orderNumber }).exec();
    if (!order) throw new NotFoundException('Order not found');
    if (order.shipment.status === 'not_required') {
      throw new BadRequestException('This order has no print copies to ship.');
    }
    if (!SHIPPABLE.includes(order.status)) {
      throw new ConflictException(
        order.status === 'refunded'
          ? 'This order was refunded, so it can’t be shipped.'
          : 'This order isn’t paid, so it can’t be shipped yet.',
      );
    }
    const from = order.shipment.status;
    if (!FROM[change.status].includes(from)) {
      throw new ConflictException(
        `The shipment is “${from}”; it can’t be marked “${change.status}” now.`,
      );
    }

    const now = new Date();
    const set: Record<string, unknown> = {
      'shipment.status': change.status,
    };
    if (change.status === 'shipped') {
      const carrier = change.carrier?.trim();
      if (!carrier) {
        throw new BadRequestException(
          'Enter the carrier (for example GIG Logistics or DHL).',
        );
      }
      set['shipment.carrier'] = carrier;
      set['shipment.trackingNumber'] = change.trackingNumber?.trim() || null;
      set['shipment.trackingUrl'] = change.trackingUrl?.trim() || null;
      if (from !== 'shipped') set['shipment.shippedAt'] = now;
    }
    if (change.status === 'delivered') set['shipment.deliveredAt'] = now;
    // Delivered print copies complete a paid order (ebooks were delivered at payment).
    const fulfil =
      change.status === 'delivered' && nextStatus(order.status, 'fulfil');

    const updated = await this.inTransaction(async (session) => {
      const result = await this.orders
        .findOneAndUpdate(
          {
            _id: order._id,
            'shipment.status': from,
            // When delivery also fulfils the order, the order must still be in exactly the status
            // the transition was computed from (a refund landing meanwhile must not be overwritten).
            status: fulfil ? order.status : { $in: SHIPPABLE },
          },
          {
            $set: { ...set, ...(fulfil ? { status: fulfil } : {}) },
            ...(fulfil
              ? {
                  $push: {
                    statusHistory: {
                      status: fulfil,
                      at: now,
                      by: `admin:${actor.sub}`,
                      note: 'Print copies delivered',
                    },
                  },
                }
              : {}),
          },
          { returnDocument: 'after', session },
        )
        .exec();
      if (!result) {
        throw new ConflictException(
          'Someone else updated this order just now. Reload it and try again.',
        );
      }
      if (change.status === 'shipped' && from !== 'shipped') {
        await this.emailShipped(result, session);
      }
      if (change.status === 'delivered') {
        await this.emailDelivered(result, session);
      }
      return result;
    });

    await this.audit.record({
      actor: { id: actor.sub, role: actor.role },
      action: `order.shipment_${change.status}`,
      entityType: 'order',
      entityId: order._id.toString(),
      changes: {
        from,
        to: change.status,
        ...(change.status === 'shipped'
          ? {
              carrier: set['shipment.carrier'],
              trackingNumber: set['shipment.trackingNumber'],
            }
          : {}),
      },
    });
    this.logger.log(
      `Order ${orderNumber}: shipment ${from} → ${change.status}`,
    );
    return updated;
  }

  private printItems(order: OrderDocument): string[] {
    return order.items
      .filter((i) => i.format === 'print')
      .map((i) => `${i.titleSnapshot} (print × ${i.quantity})`);
  }

  private firstName(order: OrderDocument): string {
    return order.customerName.split(' ')[0] || order.customerName;
  }

  private async emailShipped(order: OrderDocument, session: ClientSession) {
    const address = order.shippingAddress;
    const estimate = order.shippingEstimate;
    await this.mail.enqueue(
      {
        to: order.email,
        template: 'order.shipped',
        dedupeKey: `order-shipped:${order._id.toString()}`,
        data: {
          name: this.firstName(order),
          orderNumber: order.orderNumber,
          items: this.printItems(order),
          carrier: order.shipment.carrier ?? '',
          trackingNumber: order.shipment.trackingNumber,
          trackingUrl: order.shipment.trackingUrl,
          shippingTo: address
            ? `${address.city}, ${countryName(address.country)}`
            : '',
          estimate: estimate
            ? estimate.min === estimate.max
              ? `${estimate.min} days`
              : `${estimate.min}–${estimate.max} days`
            : null,
          orderUrl: `${this.frontendUrl}/account/orders/${order.orderNumber}`,
        },
      },
      session,
    );
    await this.notifications.notify(
      order.userId,
      {
        type: 'order_shipped',
        title: `Order ${order.orderNumber} has shipped`,
        body: order.shipment.trackingNumber
          ? `Tracking number ${order.shipment.trackingNumber}`
          : '',
        link: `/account/orders/${order.orderNumber}`,
        dedupeKey: `order-shipped:${order._id.toString()}`,
      },
      session,
    );
  }

  private async emailDelivered(order: OrderDocument, session: ClientSession) {
    await this.mail.enqueue(
      {
        to: order.email,
        template: 'order.delivered',
        dedupeKey: `order-delivered:${order._id.toString()}`,
        data: {
          name: this.firstName(order),
          orderNumber: order.orderNumber,
          items: this.printItems(order),
          orderUrl: `${this.frontendUrl}/account/orders/${order.orderNumber}`,
        },
      },
      session,
    );
    await this.notifications.notify(
      order.userId,
      {
        type: 'order_delivered',
        title: `Order ${order.orderNumber} was delivered`,
        link: `/account/orders/${order.orderNumber}`,
        dedupeKey: `order-delivered:${order._id.toString()}`,
      },
      session,
    );
  }

  private async inTransaction<T>(
    work: (session: ClientSession) => Promise<T>,
  ): Promise<T> {
    const session = await this.connection.startSession();
    try {
      return await session.withTransaction(() => work(session));
    } catch (error) {
      const message = (error as Error).message ?? '';
      if (/Transaction numbers are only allowed|replica set/i.test(message)) {
        throw new ServiceUnavailableException(
          'Orders can’t be updated right now (the database needs a replica set). Please try again shortly.',
        );
      }
      throw error;
    } finally {
      await session.endSession();
    }
  }
}
