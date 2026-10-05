import {
  ActionButton,
  DetailList,
  EmailLayout,
  Mono,
  Note,
  Paragraph,
  Title,
} from './components.js';
import type { EmailBrand } from './theme.js';

export interface EmailDeadLetterData {
  outboxId: string;
  /** Store admin → Emails (absent on alerts queued before BS-30). */
  adminUrl?: string;
  recipient: string;
  template: string;
  attempts: number;
  lastError: string;
}

/** Owner alert: an email could not be delivered after every retry (docs/ARCHITECTURE.md §11). */
export function EmailDeadLetter({
  brand,
  data,
}: {
  brand: EmailBrand;
  data: EmailDeadLetterData;
}) {
  return (
    <EmailLayout
      brand={brand}
      preview={`An email to ${data.recipient} could not be delivered.`}
      footerReason={`Operational alert for the owner of ${brand.name}.`}
    >
      <Title>An email could not be delivered</Title>
      <Paragraph>
        We stopped trying to send an email after every retry failed. The
        customer has not received it.
      </Paragraph>
      <DetailList
        rows={[
          ['Recipient', data.recipient],
          ['Email', data.template],
          ['Attempts', String(data.attempts)],
          ['Outbox id', data.outboxId],
        ]}
      />
      <Note tone="danger">
        Last error: <Mono>{data.lastError}</Mono>
      </Note>
      <Paragraph muted>
        Check the email provider dashboard and the address. Once the cause is
        fixed, send it again from Store admin → Emails.
      </Paragraph>
      {data.adminUrl && (
        <ActionButton href={data.adminUrl}>Open Emails</ActionButton>
      )}
    </EmailLayout>
  );
}

export interface DownloadAbuseData {
  customer: string;
  title: string;
  downloadsLast24h: number;
  adminUrl: string;
}

/**
 * Owner alert: one customer downloaded a book unusually often (PRODUCT_RULES §8). Sent at most
 * once a day per book and customer; nothing is blocked automatically beyond the hourly limit.
 */
export function DownloadAbuse({
  brand,
  data,
}: {
  brand: EmailBrand;
  data: DownloadAbuseData;
}) {
  return (
    <EmailLayout
      brand={brand}
      preview={`${data.customer} downloaded ${data.title} ${data.downloadsLast24h} times today.`}
      footerReason={`Operational alert for the owner of ${brand.name}.`}
    >
      <Title>Unusual number of downloads</Title>
      <Paragraph>
        One customer has downloaded the same ebook far more often than a reader
        normally would. It may be nothing (a flaky connection), or the copy may
        be being shared.
      </Paragraph>
      <DetailList
        rows={[
          ['Customer', data.customer],
          ['Book', data.title],
          ['Downloads in 24 hours', String(data.downloadsLast24h)],
        ]}
      />
      <Paragraph muted>
        Every copy carries the buyer&rsquo;s name, email and order number on
        each page. You can contact the customer from their order.
      </Paragraph>
      <ActionButton href={data.adminUrl}>Open the order</ActionButton>
    </EmailLayout>
  );
}

export interface CopyFailedData {
  customer: string;
  title: string;
  error: string;
  adminUrl: string;
}

/** Owner alert: a buyer's personal copy could not be made after every retry. */
export function CopyFailed({
  brand,
  data,
}: {
  brand: EmailBrand;
  data: CopyFailedData;
}) {
  return (
    <EmailLayout
      brand={brand}
      preview={`A buyer's copy of ${data.title} could not be prepared.`}
      footerReason={`Operational alert for the owner of ${brand.name}.`}
    >
      <Title>A buyer&rsquo;s copy could not be prepared</Title>
      <Paragraph>
        We couldn&rsquo;t make the personalised PDF for a customer who bought
        this ebook, so they can&rsquo;t read or download it yet.
      </Paragraph>
      <DetailList
        rows={[
          ['Customer', data.customer],
          ['Book', data.title],
        ]}
      />
      <Note tone="danger">
        Error: <Mono>{data.error}</Mono>
      </Note>
      <Paragraph muted>
        Usually the book PDF needs exporting again (for example without a
        password) and re-uploading in the book editor. The copy is made again
        automatically when the customer next opens the book.
      </Paragraph>
      <ActionButton href={data.adminUrl}>Open the order</ActionButton>
    </EmailLayout>
  );
}

export interface EmailBouncedData {
  recipient: string;
  /** What the email was, in plain words (`templateLabel`). */
  email: string;
  reason: string;
  orderNumber: string | null;
  adminUrl: string;
}

/**
 * Owner alert: an email a buyer relies on (receipt, set-your-password link, shipping notice,
 * a reply) was refused by their mail server after sending (BS-30). They won't know, so the owner
 * reaches them another way.
 */
export function EmailBounced({
  brand,
  data,
}: {
  brand: EmailBrand;
  data: EmailBouncedData;
}) {
  return (
    <EmailLayout
      brand={brand}
      preview={`${data.email} to ${data.recipient} bounced.`}
      footerReason={`Operational alert for the owner of ${brand.name}.`}
    >
      <Title>A customer email bounced</Title>
      <Paragraph>
        The customer&rsquo;s mail server refused this email, so they have not
        received it. The address may be mistyped or no longer in use.
      </Paragraph>
      <DetailList
        rows={[
          ['Recipient', data.recipient],
          ['Email', data.email],
          ...(data.orderNumber
            ? ([['Order', data.orderNumber]] as Array<[string, string]>)
            : []),
        ]}
      />
      <Note tone="danger">
        Reason: <Mono>{data.reason}</Mono>
      </Note>
      <Paragraph muted>
        Contact the customer another way (the order has their phone number when
        a print copy was shipped). Further emails to this address are paused
        until you allow it again on the Emails page.
      </Paragraph>
      <ActionButton href={data.adminUrl}>Open Emails</ActionButton>
    </EmailLayout>
  );
}
