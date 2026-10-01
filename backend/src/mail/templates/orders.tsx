import {
  ActionButton,
  DetailList,
  EmailLayout,
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
      <DetailList
        rows={[
          ...data.items.map((item, index): [string, string] => [
            index === 0 ? 'Items' : '',
            item,
          ]),
          ['Total', data.total],
        ]}
      />
      <ActionButton href={data.cartUrl}>Return to your cart</ActionButton>
      <Paragraph muted>
        If you meant not to buy, you can ignore this email. We won&rsquo;t send
        another reminder.
      </Paragraph>
    </EmailLayout>
  );
}
