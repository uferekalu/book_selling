import {
  ActionButton,
  DetailList,
  EmailLayout,
  Paragraph,
  Quote,
  Title,
} from './components.js';
import type { EmailBrand } from './theme.js';

export interface UnreadMessageData {
  /** Recipient's first name, or null for the store inbox. */
  name: string | null;
  from: string;
  subject: string;
  preview: string;
  conversationUrl: string;
}

/**
 * Sent 10 minutes after a message arrives if the recipient still hasn't read it, and cancelled if
 * they read it first (ARCHITECTURE §11–12). One per unread streak, not one per message.
 */
export function UnreadMessage({
  brand,
  data,
}: {
  brand: EmailBrand;
  data: UnreadMessageData;
}) {
  return (
    <EmailLayout
      brand={brand}
      preview={`${data.from}: ${data.preview}`}
      footerReason={
        data.name
          ? `You have a conversation with ${brand.name}.`
          : `Inbox alert for the staff of ${brand.name}.`
      }
    >
      <Title>You have a new message</Title>
      <Paragraph>
        {data.name ? `Hi ${data.name}, ` : ''}
        {data.from} wrote about <strong>{data.subject}</strong>:
      </Paragraph>
      <Quote>{data.preview}</Quote>
      <ActionButton href={data.conversationUrl}>Read and reply</ActionButton>
      <Paragraph muted>
        Please reply on the website rather than to this email, so the whole
        conversation stays in one place.
      </Paragraph>
    </EmailLayout>
  );
}

export interface ContactReceivedData {
  name: string;
  subject: string;
  replyTime: string;
}

/** Acknowledges a contact-form message (ARCHITECTURE §12). */
export function ContactReceived({
  brand,
  data,
}: {
  brand: EmailBrand;
  data: ContactReceivedData;
}) {
  return (
    <EmailLayout
      brand={brand}
      preview={`We received your message: ${data.subject}`}
      footerReason={`You sent a message through the ${brand.name} contact form.`}
    >
      <Title>We received your message</Title>
      <Paragraph>
        Hi {data.name}, thank you for writing to {brand.name} about{' '}
        <strong>{data.subject}</strong>. {data.replyTime}, and the reply will
        come to this email address.
      </Paragraph>
      <Paragraph muted>
        If you didn&rsquo;t send this message, you can ignore this email.
      </Paragraph>
    </EmailLayout>
  );
}

export interface ContactNewData {
  from: string;
  subject: string;
  body: string;
  inboxUrl: string;
}

/** Owner alert: a visitor used the contact form. */
export function ContactNew({
  brand,
  data,
}: {
  brand: EmailBrand;
  data: ContactNewData;
}) {
  return (
    <EmailLayout
      brand={brand}
      preview={`${data.from}: ${data.subject}`}
      footerReason={`Inbox alert for the staff of ${brand.name}.`}
    >
      <Title>New message from the contact form</Title>
      <DetailList
        rows={[
          ['From', data.from],
          ['Subject', data.subject],
        ]}
      />
      <Quote>{data.body}</Quote>
      <ActionButton href={data.inboxUrl}>Reply from the inbox</ActionButton>
    </EmailLayout>
  );
}

export interface ContactReplyData {
  name: string;
  subject: string;
  reply: string;
  from: string;
  original: string;
  contactUrl: string;
}

/** A staff reply to a contact-form message, delivered by email (the visitor has no account). */
export function ContactReply({
  brand,
  data,
}: {
  brand: EmailBrand;
  data: ContactReplyData;
}) {
  return (
    <EmailLayout
      brand={brand}
      preview={data.reply}
      footerReason={`You sent a message through the ${brand.name} contact form.`}
    >
      <Title>Re: {data.subject}</Title>
      <Paragraph>Hi {data.name},</Paragraph>
      <Quote>{data.reply}</Quote>
      <Paragraph>— {data.from}</Paragraph>
      <Paragraph muted>Your message:</Paragraph>
      <Quote>{data.original}</Quote>
      <Paragraph muted>
        To write again, use the contact form: {data.contactUrl}
      </Paragraph>
    </EmailLayout>
  );
}
