import {
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
        fixed, the email can be queued again from the admin “Needs attention”
        list.
      </Paragraph>
    </EmailLayout>
  );
}
