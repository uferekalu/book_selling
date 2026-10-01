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
import { EmailDeadLetter, type EmailDeadLetterData } from './ops.js';
import { CompleteYourOrder, type CompleteYourOrderData } from './orders.js';
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
