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

export interface CompleteYourOrderData {
  name: string;
  orderNumber: string;
  items: string[];
  total: string;
  cartUrl: string;
}

/**
 * Sent once when an unpaid order expires (PRODUCT_RULES §6): the items are still in the cart and
 * nothing was charged.
 */
export function CompleteYourOrder({
  brand,
  data,
}: {
  brand: EmailBrand;
  data: CompleteYourOrderData;
}) {
  return (
    <EmailLayout
      brand={brand}
      preview={`Your order ${data.orderNumber} wasn't completed. Your books are still in your cart.`}
      footerReason={`You started an order at ${brand.name}.`}
    >
      <Title>Your order wasn&rsquo;t completed</Title>
      <Paragraph>
        Hi {data.name}, the payment for order {data.orderNumber} didn&rsquo;t go
        through, so nothing was charged. Your books are still in your cart
        whenever you&rsquo;re ready.
      </Paragraph>
      <ItemTable
        items={data.items.map((name) => ({ name }))}
        totals={[{ label: 'Total', amount: data.total, strong: true }]}
      />
      <ActionButton href={data.cartUrl}>Return to your cart</ActionButton>
      <Paragraph muted>
        If you meant not to buy, you can ignore this email. We won&rsquo;t send
        another reminder.
      </Paragraph>
    </EmailLayout>
  );
}

export interface OrderReceiptData {
  name: string;
  orderNumber: string;
  paidAt: string;
  paymentMethod: string;
  items: Array<{ title: string; detail: string; amount: string }>;
  subtotal: string;
  discount: string | null;
  shipping: string | null;
  total: string;
  hasEbook: boolean;
  hasPrint: boolean;
  shippingTo: string | null;
  orderUrl: string;
  /** True for a guest's new account: a separate email lets them set a password. */
  claimPending: boolean;
}

/** The receipt, sent once when a payment is confirmed (inside the settlement transaction). */
export function OrderReceipt({
  brand,
  data,
}: {
  brand: EmailBrand;
  data: OrderReceiptData;
}) {
  return (
    <EmailLayout
      brand={brand}
      preview={`Payment received for order ${data.orderNumber}: ${data.total}.`}
      footerReason={`You bought from ${brand.name}. This is your receipt.`}
    >
      <Title>Thank you, {data.name}</Title>
      <Paragraph>
        We&rsquo;ve received your payment for order {data.orderNumber}. Keep
        this email as your receipt.
      </Paragraph>
      <ItemTable
        items={data.items.map((item) => ({
          name: item.title,
          detail: item.detail,
          amount: item.amount,
        }))}
        totals={[
          { label: 'Subtotal', amount: data.subtotal },
          ...(data.discount
            ? [{ label: 'Discount', amount: `−${data.discount}` }]
            : []),
          ...(data.shipping
            ? [{ label: 'Shipping', amount: data.shipping }]
            : []),
          { label: 'Total paid', amount: data.total, strong: true },
        ]}
      />
      <DetailList
        rows={[
          ['Order', data.orderNumber],
          ['Paid', data.paidAt],
          ['Payment', data.paymentMethod],
          ...(data.shippingTo
            ? ([['Ships to', data.shippingTo]] as Array<[string, string]>)
            : []),
        ]}
      />
      {data.hasEbook && (
        <Paragraph>
          Your ebook is in your library and ready to read online or download.
        </Paragraph>
      )}
      {data.hasPrint && (
        <Paragraph>
          We&rsquo;ll email you again when your print copy is on its way, with
          tracking.
        </Paragraph>
      )}
      <ActionButton href={data.orderUrl}>View your order</ActionButton>
      {data.claimPending && (
        <Note>
          We&rsquo;ve also sent a separate email with a link to set your
          password, so you can sign in and find your books any time.
        </Note>
      )}
      <Paragraph muted>
        Questions about this order? Just reply to this email.
      </Paragraph>
    </EmailLayout>
  );
}

export interface NewSaleData {
  orderNumber: string;
  customer: string;
  total: string;
  items: string[];
  adminUrl: string;
}

/** To the owner: a sale was confirmed. */
export function NewSale({
  brand,
  data,
}: {
  brand: EmailBrand;
  data: NewSaleData;
}) {
  return (
    <EmailLayout
      brand={brand}
      preview={`New sale: ${data.orderNumber}, ${data.total}.`}
      footerReason={`Sales notification for the owner of ${brand.name}.`}
    >
      <Title>New sale: {data.total}</Title>
      <ItemTable items={data.items.map((name) => ({ name }))} />
      <DetailList
        rows={[
          ['Order', data.orderNumber],
          ['Customer', data.customer],
        ]}
      />
      <ActionButton href={data.adminUrl}>Open the order</ActionButton>
    </EmailLayout>
  );
}

export interface PaymentAttentionData {
  orderNumber: string;
  reason: string;
  adminUrl: string;
}

/** To the owner: money arrived but something needs a human (amount mismatch, sold out, dispute). */
export function PaymentAttention({
  brand,
  data,
}: {
  brand: EmailBrand;
  data: PaymentAttentionData;
}) {
  return (
    <EmailLayout
      brand={brand}
      preview={`Order ${data.orderNumber} needs your attention.`}
      footerReason={`Operational alert for the owner of ${brand.name}.`}
    >
      <Title>Order {data.orderNumber} needs your attention</Title>
      <Note tone="danger">{data.reason}</Note>
      <Paragraph>
        Nothing has been done automatically. Check the order and the payment
        provider&rsquo;s dashboard, then resolve it from the admin.
      </Paragraph>
      <ActionButton href={data.adminUrl}>Open the order</ActionButton>
    </EmailLayout>
  );
}
