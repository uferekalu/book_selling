import { randomBytes } from 'node:crypto';
import { ConfigModule } from '@nestjs/config';
import { MongooseModule, getModelToken } from '@nestjs/mongoose';
import { Test, type TestingModule } from '@nestjs/testing';
import type { MongoMemoryReplSet } from 'mongodb-memory-server';
import { Types, type Model } from 'mongoose';
import { PDFDocument } from 'pdf-lib';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { startMongo } from '../../test/mongo.js';
import { AuditLog, AuditModule } from '../audit/audit.module.js';
import type { AccessTokenPayload } from '../auth/interfaces/auth.types.js';
import { AttachmentRegistry } from '../mail/attachments.js';
import { MailService } from '../mail/mail.service.js';
import { NotificationsModule } from '../notifications/notifications.module.js';
import { RealtimeModule } from '../realtime/realtime.module.js';
import { CloudinaryService } from '../uploads/cloudinary.service.js';
import { CommerceModule } from './commerce.module.js';
import { InvoiceService } from './invoice.service.js';
import { invoiceMoney } from './invoice.js';
import { Order, type OrderStatus } from './schemas/order.schema.js';
import { ShipmentsService } from './shipments.service.js';

const staff: AccessTokenPayload = {
  sub: '64b000000000000000000001',
  email: 'owner@x.com',
  role: 'owner',
  mfa: true,
  sid: 's',
  typ: 'access',
};

class FakeMail {
  sent: Array<{
    to: string;
    template: string;
    dedupeKey: string;
    data: Record<string, unknown>;
  }> = [];
  enqueue(email: FakeMail['sent'][number]) {
    if (!this.sent.some((e) => e.dedupeKey === email.dedupeKey))
      this.sent.push(email);
    return Promise.resolve({});
  }
}

/** All the text on every page of a PDF, for checking what an invoice says. */
async function pdfText(bytes: Uint8Array): Promise<string> {
  const doc = await getDocument({ data: new Uint8Array(bytes), verbosity: 0 })
    .promise;
  let text = '';
  for (let n = 1; n <= doc.numPages; n += 1) {
    const content = await (await doc.getPage(n)).getTextContent();
    text += content.items.map((i) => ('str' in i ? i.str : '')).join(' ');
    text += '\n';
  }
  return text;
}

describe('Fulfilment: shipments and invoices', () => {
  let mongod: MongoMemoryReplSet;
  let moduleRef: TestingModule;
  let shipments: ShipmentsService;
  let invoices: InvoiceService;
  let orderModel: Model<Order>;
  let auditModel: Model<AuditLog>;
  const mail = new FakeMail();

  beforeAll(async () => {
    mongod = await startMongo();
    moduleRef = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
          ignoreEnvFile: true,
          load: [
            () => ({
              NODE_ENV: 'test',
              FRONTEND_URL: 'https://books.example.com',
              BRAND_NAME: 'Foundry Books',
              BUSINESS_POSTAL_ADDRESS: '12 Foundry Road, Akoka, Lagos, Nigeria',
              SUPPORT_EMAIL: 'help@books.example.com',
            }),
          ],
        }),
        MongooseModule.forRoot(mongod.getUri()),
        AuditModule,
        RealtimeModule,
        NotificationsModule,
        CommerceModule,
      ],
    })
      .overrideProvider(CloudinaryService)
      .useValue({ configured: false, imageUrl: () => null })
      .overrideProvider(MailService)
      .useValue(mail)
      .compile();
    await moduleRef.init(); // registers the invoice attachment resolver
    shipments = moduleRef.get(ShipmentsService);
    invoices = moduleRef.get(InvoiceService);
    orderModel = moduleRef.get(getModelToken(Order.name));
    auditModel = moduleRef.get(getModelToken(AuditLog.name));
  }, 120_000);

  afterAll(async () => {
    await moduleRef?.close();
    await mongod?.stop();
  });

  beforeEach(async () => {
    await orderModel.deleteMany({});
    await auditModel.deleteMany({});
    mail.sent = [];
  });

  let seq = 0;
  async function paidOrder({
    status = 'paid' as OrderStatus,
    print = true,
    refunded = 0,
  } = {}) {
    seq += 1;
    const items = [
      {
        bookId: new Types.ObjectId(),
        format: 'ebook' as const,
        sku: 'E-1',
        titleSnapshot: 'Principles of Foundry Technology',
        slugSnapshot: 'principles-of-foundry-technology',
        unitAmount: 1_500_000,
        quantity: 1,
        lineTotal: 1_500_000,
      },
      ...(print
        ? [
            {
              bookId: new Types.ObjectId(),
              format: 'print' as const,
              sku: 'P-1',
              titleSnapshot:
                'Heat Treatment of Steels: Annealing, Normalising, Hardening and Tempering in Practice',
              slugSnapshot: 'heat-treatment-of-steels',
              unitAmount: 2_250_000,
              quantity: 2,
              lineTotal: 4_500_000,
            },
          ]
        : []),
    ];
    const subtotal = items.reduce((t, i) => t + i.lineTotal, 0);
    const shippingTotal = print ? 300_000 : 0;
    return orderModel.create({
      orderNumber: `BS-2026-${String(seq).padStart(6, '0')}`,
      userId: new Types.ObjectId(),
      email: 'ada@example.com',
      customerName: 'Ada Okafor',
      currency: 'NGN',
      items,
      subtotal,
      discountTotal: 500_000,
      coupon: { code: 'FOUNDRY10', couponId: new Types.ObjectId() },
      shippingTotal,
      taxTotal: 0,
      total: subtotal - 500_000 + shippingTotal,
      refundedTotal: refunded,
      status,
      shipment: { status: print ? 'pending' : 'not_required' },
      shippingAddress: print
        ? {
            fullName: 'Ada Okafor',
            phone: '+2348012345678',
            line1: '4 Unilag Road',
            city: 'Lagos',
            state: 'Lagos',
            country: 'NG',
          }
        : null,
      shippingEstimate: print ? { min: 3, max: 5 } : null,
      payment: {
        provider: 'paystack',
        paymentId: new Types.ObjectId(),
        paidAt: new Date('2026-10-01T14:05:00Z'),
      },
      checkoutKeyHash: randomBytes(16).toString('hex'),
    });
  }

  describe('shipments', () => {
    it('moves processing → shipped → delivered, emails the buyer twice, and fulfils the order', async () => {
      const order = await paidOrder();
      await shipments.update(
        order.orderNumber,
        { status: 'processing' },
        staff,
      );
      expect(mail.sent).toHaveLength(0); // no email for "processing"

      const shipped = await shipments.update(
        order.orderNumber,
        {
          status: 'shipped',
          carrier: ' GIG Logistics ',
          trackingNumber: 'GIG123',
          trackingUrl: 'https://track.example.com/GIG123',
        },
        staff,
      );
      expect(shipped.shipment).toMatchObject({
        status: 'shipped',
        carrier: 'GIG Logistics',
        trackingNumber: 'GIG123',
        trackingUrl: 'https://track.example.com/GIG123',
      });
      expect(shipped.shipment.shippedAt).toBeInstanceOf(Date);
      expect(mail.sent[0]).toMatchObject({
        to: 'ada@example.com',
        template: 'order.shipped',
        data: {
          name: 'Ada',
          carrier: 'GIG Logistics',
          trackingUrl: 'https://track.example.com/GIG123',
          shippingTo: 'Lagos, Nigeria',
          estimate: '3–5 days',
          items: [
            'Heat Treatment of Steels: Annealing, Normalising, Hardening and Tempering in Practice (print × 2)',
          ],
        },
      });

      // Correcting the tracking number doesn't email again or move the ship date.
      const corrected = await shipments.update(
        order.orderNumber,
        {
          status: 'shipped',
          carrier: 'GIG Logistics',
          trackingNumber: 'GIG124',
        },
        staff,
      );
      expect(corrected.shipment.trackingNumber).toBe('GIG124');
      expect(corrected.shipment.shippedAt).toEqual(shipped.shipment.shippedAt);
      expect(mail.sent).toHaveLength(1);

      const delivered = await shipments.update(
        order.orderNumber,
        { status: 'delivered' },
        staff,
      );
      expect(delivered.status).toBe('fulfilled');
      expect(delivered.statusHistory.at(-1)).toMatchObject({
        status: 'fulfilled',
        by: `admin:${staff.sub}`,
      });
      expect(mail.sent.map((m) => m.template)).toEqual([
        'order.shipped',
        'order.delivered',
      ]);
      const actions = (await auditModel.find().lean()).map((a) => a.action);
      expect(actions).toEqual([
        'order.shipment_processing',
        'order.shipment_shipped',
        'order.shipment_shipped',
        'order.shipment_delivered',
      ]);
    });

    it('refuses steps out of order, a missing carrier, unpaid, refunded and ebook-only orders', async () => {
      const order = await paidOrder();
      await expect(
        shipments.update(order.orderNumber, { status: 'delivered' }, staff),
      ).rejects.toThrow(/can’t be marked “delivered”/);
      await expect(
        shipments.update(order.orderNumber, { status: 'shipped' }, staff),
      ).rejects.toThrow(/Enter the carrier/);

      const unpaid = await paidOrder({ status: 'pending_payment' });
      await expect(
        shipments.update(unpaid.orderNumber, { status: 'processing' }, staff),
      ).rejects.toThrow(/isn’t paid/);
      const refunded = await paidOrder({ status: 'refunded' });
      await expect(
        shipments.update(refunded.orderNumber, { status: 'processing' }, staff),
      ).rejects.toThrow(/was refunded/);
      const ebookOnly = await paidOrder({ print: false });
      await expect(
        shipments.update(
          ebookOnly.orderNumber,
          { status: 'processing' },
          staff,
        ),
      ).rejects.toThrow(/no print copies/);
      expect(mail.sent).toHaveLength(0);
    });

    it('lets only one of two simultaneous updates through', async () => {
      const order = await paidOrder();
      const results = await Promise.allSettled([
        shipments.update(
          order.orderNumber,
          { status: 'shipped', carrier: 'DHL' },
          staff,
        ),
        shipments.update(
          order.orderNumber,
          { status: 'shipped', carrier: 'UPS' },
          staff,
        ),
      ]);
      const ok = results.filter((r) => r.status === 'fulfilled');
      const refused = results.filter((r) => r.status === 'rejected');
      expect(ok).toHaveLength(1);
      expect(refused).toHaveLength(1);
      expect(
        mail.sent.filter((m) => m.template === 'order.shipped'),
      ).toHaveLength(1);
    });

    it('never overwrites a refund that lands while the order is being marked delivered', async () => {
      const order = await paidOrder();
      await shipments.update(
        order.orderNumber,
        { status: 'shipped', carrier: 'DHL' },
        staff,
      );
      // The service read the order as paid; a partial refund changes it just before the write.
      const original = orderModel.findOne.bind(orderModel);
      const spy = vi.spyOn(orderModel, 'findOne').mockImplementationOnce(((
        filter: object,
      ) => {
        const query = original(filter);
        return {
          exec: async () => {
            const doc = await query.exec();
            await orderModel.collection.updateOne(
              { _id: order._id },
              { $set: { status: 'partially_refunded' } },
            );
            return doc;
          },
        };
      }) as never);
      await expect(
        shipments.update(order.orderNumber, { status: 'delivered' }, staff),
      ).rejects.toThrow(/Someone else updated this order/);
      spy.mockRestore();
      const after = (await orderModel.findById(order._id).lean())!;
      expect(after.status).toBe('partially_refunded');
      expect(after.shipment.status).toBe('shipped');
      expect(mail.sent.map((m) => m.template)).toEqual(['order.shipped']);
    });

    it('keeps a partly refunded order partly refunded when its print copies arrive', async () => {
      const order = await paidOrder({ status: 'partially_refunded' });
      await shipments.update(
        order.orderNumber,
        { status: 'shipped', carrier: 'DHL' },
        staff,
      );
      const delivered = await shipments.update(
        order.orderNumber,
        { status: 'delivered' },
        staff,
      );
      expect(delivered.status).toBe('partially_refunded');
      expect(delivered.shipment.status).toBe('delivered');
    });
  });

  describe('invoices', () => {
    it('formats money with the currency code and exact digit grouping', () => {
      expect(invoiceMoney(1_500_000, 'NGN')).toBe('NGN 15,000.00');
      expect(invoiceMoney(2999, 'USD')).toBe('USD 29.99');
      expect(invoiceMoney(5, 'GBP')).toBe('GBP 0.05');
      expect(invoiceMoney(123_456_789_00, 'EUR')).toBe('EUR 123,456,789.00');
      expect(invoiceMoney(-250_000, 'NGN')).toBe('-NGN 2,500.00');
    });

    it('lists the seller, buyer, items, discount, shipping, total and refunds', async () => {
      const order = await paidOrder({
        status: 'partially_refunded',
        refunded: 1_500_000,
      });
      const bytes = await invoices.pdf(order);
      const text = await pdfText(bytes);
      for (const expected of [
        'Foundry Books',
        'INVOICE',
        '12 Foundry Road, Akoka, Lagos, Nigeria',
        order.orderNumber,
        '1 October 2026',
        'Paid (partly refunded)',
        'Paystack',
        'Ada Okafor',
        'ada@example.com',
        '4 Unilag Road',
        'Principles of Foundry Technology',
        'Ebook (PDF)',
        'Print edition',
        'NGN 22,500.00', // unit price of the print book
        'NGN 45,000.00',
        'Discount (FOUNDRY10)',
        '-NGN 5,000.00',
        'NGN 3,000.00', // shipping
        'NGN 58,000.00', // total
        '-NGN 15,000.00', // refunded
        'NGN 43,000.00', // net
        'Prices include any applicable taxes.',
      ]) {
        expect(text).toContain(expected);
      }
      // The long title wraps instead of running into the price columns.
      expect(text).toContain(
        'Heat Treatment of Steels: Annealing, Normalising,',
      );
      const doc = await PDFDocument.load(bytes);
      expect(doc.getTitle()).toBe(`Invoice ${order.orderNumber}`);
    });

    it('has no invoice before payment', async () => {
      const unpaid = await paidOrder({ status: 'pending_payment' });
      await expect(invoices.pdf(unpaid)).rejects.toThrow(
        /once the order is paid/,
      );
    });

    it('is attached to the receipt through the attachment registry', async () => {
      const order = await paidOrder({ print: false });
      const [file] = await moduleRef
        .get(AttachmentRegistry)
        .resolve([{ kind: 'invoice', ref: order._id.toString() }]);
      expect(file.filename).toBe(`invoice-${order.orderNumber}.pdf`);
      expect(file.contentType).toBe('application/pdf');
      expect(file.content.subarray(0, 5).toString()).toBe('%PDF-');
    });
  });
});
