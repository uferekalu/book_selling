import {
  Body,
  Button,
  Container,
  Head,
  Heading,
  Hr,
  Html,
  Link,
  Preview,
  Section,
  Text,
} from '@react-email/components';
import type { CSSProperties, ReactNode } from 'react';
import { emailTheme as t, type EmailBrand } from './theme.js';

/**
 * Shared email building blocks. Rules: a single 600px column (readable on every phone), real
 * text rather than images, 16px body copy, AA contrast, and a plain URL under every button for
 * clients that strip buttons or for people who copy links.
 */

export function EmailLayout({
  brand,
  preview,
  footerReason,
  children,
}: {
  brand: EmailBrand;
  /** Inbox preview line shown after the subject. */
  preview: string;
  /** Why the recipient is getting this email. */
  footerReason: string;
  children: ReactNode;
}) {
  return (
    <Html lang="en" dir="ltr">
      <Head>
        <meta name="color-scheme" content="light" />
        <meta name="supported-color-schemes" content="light" />
      </Head>
      <Preview>{preview}</Preview>
      <Body
        style={{
          margin: 0,
          backgroundColor: t.color.background,
          fontFamily: t.font.body,
        }}
      >
        <Container
          style={{ maxWidth: 600, margin: '0 auto', padding: '32px 16px' }}
        >
          <Section style={{ padding: '0 8px 20px' }}>
            <Link href={brand.siteUrl} style={{ textDecoration: 'none' }}>
              <Text
                style={{
                  margin: 0,
                  fontFamily: t.font.display,
                  fontSize: 22,
                  color: t.color.primary,
                  letterSpacing: '-0.01em',
                }}
              >
                {brand.name}
              </Text>
            </Link>
          </Section>
          <Section
            style={{
              backgroundColor: t.color.surface,
              border: `1px solid ${t.color.border}`,
              borderRadius: 16,
              padding: '32px 28px',
            }}
          >
            {children}
          </Section>
          <Section style={{ padding: '24px 8px 0' }}>
            <Text style={footerText}>{footerReason}</Text>
            {brand.supportEmail && (
              <Text style={footerText}>
                Questions? Reply to this email or write to{' '}
                <Link
                  href={`mailto:${brand.supportEmail}`}
                  style={{ color: t.color.textMuted }}
                >
                  {brand.supportEmail}
                </Link>
                .
              </Text>
            )}
            <Text style={footerText}>
              © {new Date().getFullYear()} {brand.name}
              {brand.postalAddress ? ` · ${brand.postalAddress}` : ''}
            </Text>
          </Section>
        </Container>
      </Body>
    </Html>
  );
}

const footerText: CSSProperties = {
  margin: '0 0 8px',
  fontSize: 12,
  lineHeight: '18px',
  color: t.color.textSubtle,
};

export function Title({ children }: { children: ReactNode }) {
  return (
    <Heading
      as="h1"
      style={{
        margin: '0 0 16px',
        fontFamily: t.font.display,
        fontSize: 26,
        lineHeight: '32px',
        fontWeight: 500,
        color: t.color.text,
      }}
    >
      {children}
    </Heading>
  );
}

export function Paragraph({
  children,
  muted = false,
}: {
  children: ReactNode;
  muted?: boolean;
}) {
  return (
    <Text
      style={{
        margin: '0 0 16px',
        fontSize: 16,
        lineHeight: '26px',
        color: muted ? t.color.textMuted : t.color.text,
      }}
    >
      {children}
    </Text>
  );
}

/** Primary call to action, with the raw URL underneath as a fallback. */
export function ActionButton({
  href,
  children,
}: {
  href: string;
  children: ReactNode;
}) {
  return (
    <Section style={{ margin: '8px 0 24px' }}>
      <Button
        href={href}
        style={{
          display: 'inline-block',
          backgroundColor: t.color.primary,
          color: t.color.onPrimary,
          fontSize: 16,
          fontWeight: 600,
          textDecoration: 'none',
          borderRadius: 10,
          padding: '14px 28px',
        }}
      >
        {children}
      </Button>
      <Text
        style={{
          margin: '16px 0 0',
          fontSize: 13,
          lineHeight: '20px',
          color: t.color.textMuted,
        }}
      >
        If the button doesn’t work, copy this link into your browser:
        <br />
        <Link
          href={href}
          style={{ color: t.color.primary, wordBreak: 'break-all' }}
        >
          {href}
        </Link>
      </Text>
    </Section>
  );
}

/** Highlighted note: expiry times, security advice. */
export function Note({
  children,
  tone = 'accent',
}: {
  children: ReactNode;
  tone?: 'accent' | 'danger';
}) {
  return (
    <Section
      style={{
        backgroundColor:
          tone === 'danger' ? t.color.dangerSubtle : t.color.accentSubtle,
        borderRadius: 10,
        padding: '12px 16px',
        margin: '0 0 16px',
      }}
    >
      <Text
        style={{
          margin: 0,
          fontSize: 14,
          lineHeight: '22px',
          color: tone === 'danger' ? t.color.danger : t.color.onAccentSubtle,
        }}
      >
        {children}
      </Text>
    </Section>
  );
}

export function Divider() {
  return <Hr style={{ borderColor: t.color.border, margin: '24px 0' }} />;
}

/** Label/value rows for details such as device, time and location. */
export function DetailList({
  rows,
}: {
  rows: Array<[label: string, value: string]>;
}) {
  return (
    <Section style={{ margin: '0 0 16px' }}>
      {rows.map(([label, value]) => (
        <Text
          key={label}
          style={{
            margin: '0 0 6px',
            fontSize: 14,
            lineHeight: '22px',
            color: t.color.text,
          }}
        >
          <span style={{ color: t.color.textMuted }}>{label}: </span>
          {value}
        </Text>
      ))}
    </Section>
  );
}

export function Mono({ children }: { children: ReactNode }) {
  return (
    <span style={{ fontFamily: t.font.mono, fontSize: 14 }}>{children}</span>
  );
}
