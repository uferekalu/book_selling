import {
  ActionButton,
  DetailList,
  Divider,
  EmailLayout,
  Note,
  Paragraph,
  Title,
} from './components.js';
import type { EmailBrand } from './theme.js';

const accountReason = (brand: EmailBrand) =>
  `You’re receiving this because an account at ${brand.name} uses this email address.`;

export interface VerifyEmailData {
  name: string;
  verifyUrl: string;
  expiresInHours: number;
}

export function VerifyEmail({
  brand,
  data,
}: {
  brand: EmailBrand;
  data: VerifyEmailData;
}) {
  return (
    <EmailLayout
      brand={brand}
      preview="Confirm your email to finish setting up your account."
      footerReason={accountReason(brand)}
    >
      <Title>Confirm your email</Title>
      <Paragraph>Hi {data.name},</Paragraph>
      <Paragraph>
        Welcome to {brand.name}. Please confirm this is your email address so we
        can send your receipts and keep your library secure.
      </Paragraph>
      <ActionButton href={data.verifyUrl}>Confirm email address</ActionButton>
      <Note>
        This link expires in {data.expiresInHours} hours and can only be used
        once.
      </Note>
      <Paragraph muted>
        If you didn’t create an account, you can safely ignore this email.
      </Paragraph>
    </EmailLayout>
  );
}

export interface WelcomeData {
  name: string;
  browseUrl: string;
}

export function Welcome({
  brand,
  data,
}: {
  brand: EmailBrand;
  data: WelcomeData;
}) {
  return (
    <EmailLayout
      brand={brand}
      preview="Your account is ready. Start with a free introduction."
      footerReason={accountReason(brand)}
    >
      <Title>Welcome, {data.name}</Title>
      <Paragraph>Your email is confirmed and your account is ready.</Paragraph>
      <Paragraph>
        Every book here lets you read its abstract and introduction free, right
        in your browser, before you decide. Ebooks are yours instantly after
        purchase, to read online on any device or download.
      </Paragraph>
      <ActionButton href={data.browseUrl}>Browse the books</ActionButton>
    </EmailLayout>
  );
}

export interface PasswordResetData {
  name: string;
  resetUrl: string;
  expiresInMinutes: number;
}

export function PasswordReset({
  brand,
  data,
}: {
  brand: EmailBrand;
  data: PasswordResetData;
}) {
  return (
    <EmailLayout
      brand={brand}
      preview="Use this link to choose a new password."
      footerReason={accountReason(brand)}
    >
      <Title>Reset your password</Title>
      <Paragraph>Hi {data.name},</Paragraph>
      <Paragraph>
        We received a request to reset the password for your account.
      </Paragraph>
      <ActionButton href={data.resetUrl}>Choose a new password</ActionButton>
      <Note>
        This link expires in {data.expiresInMinutes} minutes and works once.
        Resetting your password signs you out on every other device.
      </Note>
      <Paragraph muted>
        Didn’t ask for this? You can ignore this email: your password won’t
        change. If you keep getting these, let us know.
      </Paragraph>
    </EmailLayout>
  );
}

export interface ClaimAccountData {
  name: string;
  claimUrl: string;
  expiresInDays: number;
  orderNumber?: string;
}

export function ClaimAccount({
  brand,
  data,
}: {
  brand: EmailBrand;
  data: ClaimAccountData;
}) {
  return (
    <EmailLayout
      brand={brand}
      preview="Set a password to open your library on any device."
      footerReason={`You’re receiving this because you placed an order at ${brand.name} with this email address.`}
    >
      <Title>Set up your account</Title>
      <Paragraph>Hi {data.name},</Paragraph>
      <Paragraph>
        Thank you for your order{data.orderNumber ? ` ${data.orderNumber}` : ''}
        . We’ve saved it to an account under this email. Set a password to read
        your ebooks online, download them again, track deliveries and message
        the author, from any device.
      </Paragraph>
      <ActionButton href={data.claimUrl}>Set my password</ActionButton>
      <Note>
        This link expires in {data.expiresInDays} days. You can always use
        “Forgot password” later instead.
      </Note>
    </EmailLayout>
  );
}

export const SECURITY_EVENTS = {
  password_changed: 'Your password was changed',
  new_login: 'New sign-in to your account',
  email_changed: 'Your email address was changed',
  two_factor_enabled: 'Two-step verification was turned on',
  two_factor_disabled: 'Two-step verification was turned off',
} as const;
export type SecurityEvent = keyof typeof SECURITY_EVENTS;

export interface SecurityNoticeData {
  name: string;
  event: SecurityEvent;
  /** ISO timestamp. */
  occurredAt: string;
  device?: string;
  location?: string;
  secureAccountUrl: string;
}

export function formatEventTime(iso: string): string {
  return (
    new Intl.DateTimeFormat('en-GB', {
      dateStyle: 'medium',
      timeStyle: 'short',
      timeZone: 'UTC',
    }).format(new Date(iso)) + ' UTC'
  );
}

export function SecurityNotice({
  brand,
  data,
}: {
  brand: EmailBrand;
  data: SecurityNoticeData;
}) {
  const rows: Array<[string, string]> = [
    ['When', formatEventTime(data.occurredAt)],
  ];
  if (data.device) rows.push(['Device', data.device]);
  if (data.location) rows.push(['Approximate location', data.location]);
  return (
    <EmailLayout
      brand={brand}
      preview={`${SECURITY_EVENTS[data.event]}. If this wasn't you, act now.`}
      footerReason={accountReason(brand)}
    >
      <Title>{SECURITY_EVENTS[data.event]}</Title>
      <Paragraph>Hi {data.name},</Paragraph>
      <Paragraph>
        We’re letting you know about a security change on your account.
      </Paragraph>
      <DetailList rows={rows} />
      <Divider />
      <Paragraph>If this was you, there’s nothing to do.</Paragraph>
      <Note tone="danger">
        If it wasn’t you, secure your account now: reset your password and sign
        out other devices.
      </Note>
      <ActionButton href={data.secureAccountUrl}>
        Secure my account
      </ActionButton>
    </EmailLayout>
  );
}
