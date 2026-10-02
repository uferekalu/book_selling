import {
  ActionButton,
  DetailList,
  EmailLayout,
  ItemTable,
  Note,
  Paragraph,
  Title,
} from './components.js';
import type { EmailBrand } from './theme.js';

export interface EditionUpdatedData {
  name: string;
  title: string;
  libraryUrl: string;
}

/**
 * To every owner of an ebook when the author replaces its file and chooses to tell buyers
 * (ARCHITECTURE §10.3). Their library already has the new edition.
 */
export function EditionUpdated({
  brand,
  data,
}: {
  brand: EmailBrand;
  data: EditionUpdatedData;
}) {
  return (
    <EmailLayout
      brand={brand}
      preview={`An updated edition of ${data.title} is in your library.`}
      footerReason={`You own the ebook ${data.title} from ${brand.name}.`}
    >
      <Title>An updated edition is in your library</Title>
      <Paragraph>
        Hi {data.name}, the author has published an updated edition of{' '}
        <strong>{data.title}</strong>. It&rsquo;s already in your library, at no
        extra cost: read it online or download it again.
      </Paragraph>
      <ActionButton href={data.libraryUrl}>Open your library</ActionButton>
      <Paragraph muted>
        Copies you downloaded before are not changed; download the book again to
        get the new edition.
      </Paragraph>
    </EmailLayout>
  );
}

export interface OrderShippedData {
  name: string;
  orderNumber: string;
  items: string[];
  carrier: string;
  trackingNumber: string | null;
  trackingUrl: string | null;
  shippingTo: string;
  estimate: string | null;
  orderUrl: string;
}

/** To the buyer: the print copy has left (PRODUCT_RULES §8). */
export function OrderShipped({
  brand,
  data,
}: {
  brand: EmailBrand;
  data: OrderShippedData;
}) {
  return (
    <EmailLayout
      brand={brand}
      preview={`Order ${data.orderNumber} is on its way with ${data.carrier}.`}
      footerReason={`You bought from ${brand.name}.`}
    >
      <Title>Your books are on their way</Title>
      <Paragraph>
        Hi {data.name}, we&rsquo;ve shipped the print copies from order{' '}
        {data.orderNumber}.
      </Paragraph>
      <ItemTable items={data.items.map((name) => ({ name }))} />
      <DetailList
        rows={[
          ['Carrier', data.carrier],
          ...(data.trackingNumber
            ? ([['Tracking number', data.trackingNumber]] as Array<
                [string, string]
              >)
            : []),
          ['Ships to', data.shippingTo],
          ...(data.estimate
            ? ([['Expected', data.estimate]] as Array<[string, string]>)
            : []),
        ]}
      />
      {data.trackingUrl ? (
        <ActionButton href={data.trackingUrl}>Track your parcel</ActionButton>
      ) : (
        <ActionButton href={data.orderUrl}>View your order</ActionButton>
      )}
      <Paragraph muted>
        Questions about the delivery? Just reply to this email.
      </Paragraph>
    </EmailLayout>
  );
}

export interface OrderDeliveredData {
  name: string;
  orderNumber: string;
  items: string[];
  orderUrl: string;
}

/** To the buyer: the print copy arrived. */
export function OrderDelivered({
  brand,
  data,
}: {
  brand: EmailBrand;
  data: OrderDeliveredData;
}) {
  return (
    <EmailLayout
      brand={brand}
      preview={`Order ${data.orderNumber} has been delivered.`}
      footerReason={`You bought from ${brand.name}.`}
    >
      <Title>Your books have arrived</Title>
      <Paragraph>
        Hi {data.name}, order {data.orderNumber} has been delivered. We hope you
        enjoy it.
      </Paragraph>
      <ItemTable items={data.items.map((name) => ({ name }))} />
      <ActionButton href={data.orderUrl}>View your order</ActionButton>
      <Paragraph muted>
        Something wrong with the delivery, or a damaged copy? Reply to this
        email and we&rsquo;ll put it right.
      </Paragraph>
    </EmailLayout>
  );
}

export interface RefundIssuedData {
  name: string;
  orderNumber: string;
  amount: string;
  /** "Full refund" or "Partial refund". */
  kind: string;
  paymentMethod: string;
  ebooksRemoved: string[];
  orderUrl: string;
}

/** To the buyer: a refund was confirmed by the payment provider (PRODUCT_RULES §10). */
export function RefundIssued({
  brand,
  data,
}: {
  brand: EmailBrand;
  data: RefundIssuedData;
}) {
  return (
    <EmailLayout
      brand={brand}
      preview={`We've refunded ${data.amount} for order ${data.orderNumber}.`}
      footerReason={`You bought from ${brand.name}.`}
    >
      <Title>Your refund is on its way</Title>
      <Paragraph>
        Hi {data.name}, we&rsquo;ve refunded <strong>{data.amount}</strong> for
        order {data.orderNumber}.
      </Paragraph>
      <DetailList
        rows={[
          ['Refund', data.kind],
          ['Amount', data.amount],
          ['Back to', `Your original payment method (${data.paymentMethod})`],
        ]}
      />
      <Paragraph>
        Banks usually show a refund within 5–10 working days, depending on your
        bank or card issuer.
      </Paragraph>
      {data.ebooksRemoved.length > 0 && (
        <Note>
          {data.ebooksRemoved.length === 1
            ? 'This ebook has'
            : 'These ebooks have'}{' '}
          been removed from your library: {data.ebooksRemoved.join(', ')}.
        </Note>
      )}
      <ActionButton href={data.orderUrl}>View your order</ActionButton>
    </EmailLayout>
  );
}
