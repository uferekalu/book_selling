import type { ReactElement } from 'react';
import type { EmailCategory } from '../schemas/email-outbox.schema.js';
import {
  ClaimAccount,
  PasswordReset,
  SECURITY_EVENTS,
  SecurityNotice,
  VerifyEmail,
  Welcome,
  type ClaimAccountData,
  type PasswordResetData,
  type SecurityNoticeData,
  type VerifyEmailData,
  type WelcomeData,
} from './auth.js';
import {
  EditionUpdated,
  OrderDelivered,
  OrderShipped,
  RefundIssued,
  type EditionUpdatedData,
  type OrderDeliveredData,
  type OrderShippedData,
  type RefundIssuedData,
} from './fulfilment.js';
import {
  CopyFailed,
  DownloadAbuse,
  EmailDeadLetter,
  type CopyFailedData,
  type DownloadAbuseData,
  type EmailDeadLetterData,
} from './ops.js';
import {
  CompleteYourOrder,
  NewSale,
  OrderReceipt,
  PaymentAttention,
  type CompleteYourOrderData,
  type NewSaleData,
  type OrderReceiptData,
  type PaymentAttentionData,
} from './orders.js';
import type { EmailBrand } from './theme.js';

export interface TemplateDefinition<D> {
  subject: (data: D, brand: EmailBrand) => string;
  render: (data: D, brand: EmailBrand) => ReactElement;
  category: EmailCategory;
  /** Data holds a secret (a one-time link). It is erased from the outbox once sent. */
  sensitive: boolean;
  /** Realistic example input for previews and the render test. */
  sample: D;
}

const define = <D,>(definition: TemplateDefinition<D>) => definition;

/**
 * Every email the platform can send. Adding one: write the component, register it here with a
 * sample, and the render test plus `npm run email:preview` cover it automatically.
 */
export const EMAIL_TEMPLATES = {
  'order.receipt': define<OrderReceiptData>({
    subject: (data, brand) =>
      `Your receipt from ${brand.name}: order ${data.orderNumber}`,
    render: (data, brand) => <OrderReceipt data={data} brand={brand} />,
    category: 'critical',
    sensitive: false,
    sample: {
      name: 'Ada',
      orderNumber: 'BS-2026-000123',
      paidAt: '1 October 2026, 14:05',
      paymentMethod: 'Paystack',
      items: [
        {
          title: 'Principles of Foundry Technology',
          detail: 'Ebook (PDF)',
          amount: '₦15,000.00',
        },
        {
          title: 'Heat Treatment of Steels',
          detail: 'Print × 1',
          amount: '₦22,000.00',
        },
      ],
      subtotal: '₦37,000.00',
      discount: '₦3,700.00',
      shipping: '₦2,500.00',
      total: '₦35,800.00',
      hasEbook: true,
      hasPrint: true,
      shippingTo: 'Lagos, Nigeria',
      orderUrl: 'https://example.com/account/orders/BS-2026-000123',
      libraryUrl: 'https://example.com/account/library',
      claimPending: true,
    },
  }),
  'order.new-sale': define<NewSaleData>({
    subject: (data) => `New sale ${data.orderNumber}: ${data.total}`,
    render: (data, brand) => <NewSale data={data} brand={brand} />,
    category: 'notification',
    sensitive: false,
    sample: {
      orderNumber: 'BS-2026-000123',
      customer: 'Ada Obi (ada@example.com)',
      total: '₦35,800.00',
      items: ['Principles of Foundry Technology (ebook)'],
      adminUrl: 'https://example.com/admin/orders/BS-2026-000123',
    },
  }),
  'order.payment-attention': define<PaymentAttentionData>({
    subject: (data) => `Action needed: order ${data.orderNumber}`,
    render: (data, brand) => <PaymentAttention data={data} brand={brand} />,
    category: 'critical',
    sensitive: false,
    sample: {
      orderNumber: 'BS-2026-000123',
      reason:
        'The provider confirmed ₦35,000.00 but the order total is ₦35,800.00.',
      adminUrl: 'https://example.com/admin/orders/BS-2026-000123',
    },
  }),
  'order.complete-your-order': define<CompleteYourOrderData>({
    subject: (data) => `Your order ${data.orderNumber} wasn’t completed`,
    render: (data, brand) => <CompleteYourOrder data={data} brand={brand} />,
    category: 'notification',
    sensitive: false,
    sample: {
      name: 'Ada',
      orderNumber: 'BS-2026-000123',
      items: [
        'Principles of Foundry Technology (ebook)',
        'Heat Treatment of Steels (print × 1)',
      ],
      total: '₦40,000.00',
      cartUrl: 'https://example.com/cart',
    },
  }),
  'auth.verify-email': define<VerifyEmailData>({
    subject: (_, brand) => `Confirm your email for ${brand.name}`,
    render: (data, brand) => <VerifyEmail data={data} brand={brand} />,
    category: 'critical',
    sensitive: true,
    sample: {
      name: 'Ada',
      verifyUrl: 'https://example.com/verify-email?token=sample',
      expiresInHours: 24,
    },
  }),
  'auth.welcome': define<WelcomeData>({
    subject: (_, brand) => `Welcome to ${brand.name}`,
    render: (data, brand) => <Welcome data={data} brand={brand} />,
    category: 'notification',
    sensitive: false,
    sample: { name: 'Ada', browseUrl: 'https://example.com/books' },
  }),
  'auth.password-reset': define<PasswordResetData>({
    subject: (_, brand) => `Reset your ${brand.name} password`,
    render: (data, brand) => <PasswordReset data={data} brand={brand} />,
    category: 'critical',
    sensitive: true,
    sample: {
      name: 'Ada',
      resetUrl: 'https://example.com/reset-password?token=sample',
      expiresInMinutes: 60,
    },
  }),
  'auth.claim-account': define<ClaimAccountData>({
    subject: (_, brand) => `Set a password for your ${brand.name} account`,
    render: (data, brand) => <ClaimAccount data={data} brand={brand} />,
    category: 'critical',
    sensitive: true,
    sample: {
      name: 'Ada',
      claimUrl: 'https://example.com/claim-account?token=sample',
      expiresInDays: 7,
      orderNumber: 'BS-2026-000123',
    },
  }),
  'auth.security-notice': define<SecurityNoticeData>({
    subject: (data) => SECURITY_EVENTS[data.event],
    render: (data, brand) => <SecurityNotice data={data} brand={brand} />,
    category: 'critical',
    sensitive: false,
    sample: {
      name: 'Ada',
      event: 'new_login',
      occurredAt: '2026-09-30T14:05:00.000Z',
      device: 'Chrome on Android',
      location: 'Lagos, Nigeria',
      secureAccountUrl: 'https://example.com/account/security',
    },
  }),
  'order.shipped': define<OrderShippedData>({
    subject: (data) => `Order ${data.orderNumber} is on its way`,
    render: (data, brand) => <OrderShipped data={data} brand={brand} />,
    category: 'notification',
    sensitive: false,
    sample: {
      name: 'Ada',
      orderNumber: 'BS-2026-000123',
      items: ['Principles of Foundry Technology (print × 1)'],
      carrier: 'GIG Logistics',
      trackingNumber: 'GIG123456789',
      trackingUrl: 'https://example.com/track/GIG123456789',
      shippingTo: 'Lagos, Nigeria',
      estimate: '3–5 days',
      orderUrl: 'https://example.com/account/orders/BS-2026-000123',
    },
  }),
  'order.delivered': define<OrderDeliveredData>({
    subject: (data) => `Order ${data.orderNumber} has been delivered`,
    render: (data, brand) => <OrderDelivered data={data} brand={brand} />,
    category: 'notification',
    sensitive: false,
    sample: {
      name: 'Ada',
      orderNumber: 'BS-2026-000123',
      items: ['Principles of Foundry Technology (print × 1)'],
      orderUrl: 'https://example.com/account/orders/BS-2026-000123',
    },
  }),
  'order.refund-issued': define<RefundIssuedData>({
    subject: (data) => `Refund for order ${data.orderNumber}: ${data.amount}`,
    render: (data, brand) => <RefundIssued data={data} brand={brand} />,
    category: 'critical',
    sensitive: false,
    sample: {
      name: 'Ada',
      orderNumber: 'BS-2026-000123',
      amount: '₦15,000.00',
      kind: 'Full refund',
      paymentMethod: 'Paystack',
      ebooksRemoved: ['Principles of Foundry Technology'],
      orderUrl: 'https://example.com/account/orders/BS-2026-000123',
    },
  }),
  'library.edition-updated': define<EditionUpdatedData>({
    subject: (data) => `An updated edition of ${data.title} is in your library`,
    render: (data, brand) => <EditionUpdated data={data} brand={brand} />,
    category: 'notification',
    sensitive: false,
    sample: {
      name: 'Ada',
      title: 'Principles of Foundry Technology',
      libraryUrl: 'https://example.com/account/library',
    },
  }),
  'ops.download-abuse': define<DownloadAbuseData>({
    subject: (data) => `Unusual downloads: ${data.title}`,
    render: (data, brand) => <DownloadAbuse data={data} brand={brand} />,
    category: 'critical',
    sensitive: false,
    sample: {
      customer: 'Ada Okafor (ada@example.com)',
      title: 'Principles of Foundry Technology',
      downloadsLast24h: 34,
      adminUrl: 'https://example.com/admin/orders/BS-2026-000123',
    },
  }),
  'ops.copy-failed': define<CopyFailedData>({
    subject: (data) => `A buyer's copy of ${data.title} could not be prepared`,
    render: (data, brand) => <CopyFailed data={data} brand={brand} />,
    category: 'critical',
    sensitive: false,
    sample: {
      customer: 'Ada Okafor (ada@example.com)',
      title: 'Principles of Foundry Technology',
      error: 'This PDF is password-protected or encrypted.',
      adminUrl: 'https://example.com/admin/orders/BS-2026-000123',
    },
  }),
  'ops.email-dead-letter': define<EmailDeadLetterData>({
    subject: (data) =>
      `Email delivery failed: ${data.template} to ${data.recipient}`,
    render: (data, brand) => <EmailDeadLetter data={data} brand={brand} />,
    category: 'critical',
    sensitive: false,
    sample: {
      outboxId: '66f9c0ffee0000000000abcd',
      recipient: 'ada@example.com',
      template: 'auth.verify-email',
      attempts: 8,
      lastError: 'Resend validation_error: Invalid `to` field',
    },
  }),
};

export type TemplateName = keyof typeof EMAIL_TEMPLATES;
export type TemplateData<N extends TemplateName> =
  (typeof EMAIL_TEMPLATES)[N]['sample'];

export function isTemplateName(name: string): name is TemplateName {
  return Object.hasOwn(EMAIL_TEMPLATES, name);
}
