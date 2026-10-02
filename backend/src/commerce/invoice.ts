import { PDFDocument, rgb, StandardFonts, type PDFFont } from 'pdf-lib';
import type { Currency } from '../common/money/currency.js';
import { money, subtract, toMajorString } from '../common/money/money.js';
import { encodable } from '../preview/preview-builder.js';
import type { Order } from './schemas/order.schema.js';

export interface InvoiceSeller {
  name: string;
  address: string | null;
  email: string | null;
  website: string | null;
}

export type InvoiceOrder = Pick<
  Order,
  | 'orderNumber'
  | 'customerName'
  | 'email'
  | 'currency'
  | 'items'
  | 'subtotal'
  | 'discountTotal'
  | 'shippingTotal'
  | 'total'
  | 'refundedTotal'
  | 'coupon'
  | 'shippingAddress'
  | 'payment'
  | 'status'
>;

/**
 * "NGN 15,000.00": the code rather than the symbol, because the PDF's built-in font has no naira
 * sign. Digits are grouped by string manipulation, never with floating-point maths.
 */
export function invoiceMoney(amount: number, currency: Currency): string {
  const [whole, fraction] = toMajorString(money(amount, currency)).split('.');
  const negative = whole.startsWith('-');
  const digits = negative ? whole.slice(1) : whole;
  const grouped = digits.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return `${negative ? '-' : ''}${currency} ${grouped}${fraction ? `.${fraction}` : ''}`;
}

const PAGE: [number, number] = [595.28, 841.89]; // A4
const MARGIN = 48;
const INK = rgb(0.17, 0.12, 0.08);
const MUTED = rgb(0.42, 0.36, 0.3);
const RULE = rgb(0.86, 0.82, 0.77);
const BRAND = rgb(0.44, 0.26, 0.15);

const PROVIDERS: Record<string, string> = {
  paystack: 'Paystack',
  flutterwave: 'Flutterwave',
  stripe: 'Stripe',
};

/**
 * The PDF invoice for a paid order (PRODUCT_RULES §10: attached to the receipt, and downloadable
 * from the order). The order number is the invoice number. Prices are tax-inclusive in v1.
 */
export async function buildInvoice(
  order: InvoiceOrder,
  seller: InvoiceSeller,
): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const regular = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const m = (amount: number) => invoiceMoney(amount, order.currency);
  const paidAt = order.payment?.paidAt ?? null;
  const dateText = (date: Date) =>
    new Intl.DateTimeFormat('en-GB', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
      timeZone: 'UTC',
    }).format(date);

  let page = doc.addPage(PAGE);
  const width = PAGE[0] - MARGIN * 2;
  let y = PAGE[1] - MARGIN;

  const text = (
    value: string,
    x: number,
    options: {
      font?: PDFFont;
      size?: number;
      color?: ReturnType<typeof rgb>;
      align?: 'left' | 'right';
    } = {},
  ) => {
    const font = options.font ?? regular;
    const size = options.size ?? 10;
    const safe = encodable(value, font);
    const drawX =
      options.align === 'right' ? x - font.widthOfTextAtSize(safe, size) : x;
    page.drawText(safe, {
      x: drawX,
      y,
      size,
      font,
      color: options.color ?? INK,
    });
  };
  const rule = (thickness = 0.75) => {
    page.drawLine({
      start: { x: MARGIN, y },
      end: { x: MARGIN + width, y },
      thickness,
      color: RULE,
    });
  };
  /** Starts a new page when the next block won't fit; returns whether it did. */
  const newPageIfNeeded = (needed: number): boolean => {
    if (y - needed > MARGIN + 40) return false;
    page = doc.addPage(PAGE);
    y = PAGE[1] - MARGIN;
    return true;
  };

  // ---- header
  text(seller.name, MARGIN, { font: bold, size: 18, color: BRAND });
  text('INVOICE', MARGIN + width, {
    font: bold,
    size: 18,
    align: 'right',
  });
  y -= 22;
  for (const line of [
    ...(seller.address ? wrap(seller.address, regular, 9, width / 2) : []),
    ...(seller.email ? [seller.email] : []),
    ...(seller.website ? [seller.website] : []),
  ]) {
    text(line, MARGIN, { size: 9, color: MUTED });
    y -= 12;
  }

  // Invoice details, top right (drawn at the header's height).
  let detailY = PAGE[1] - MARGIN - 22;
  const detail = (label: string, value: string) => {
    const saved = y;
    y = detailY;
    text(label, MARGIN + width - 150, { size: 9, color: MUTED });
    text(value, MARGIN + width, { size: 9, font: bold, align: 'right' });
    y = saved;
    detailY -= 13;
  };
  detail('Invoice number', order.orderNumber);
  if (paidAt) detail('Date paid', dateText(paidAt));
  detail('Status', statusLabel(order));
  if (order.payment)
    detail(
      'Paid with',
      PROVIDERS[order.payment.provider] ?? order.payment.provider,
    );

  y = Math.min(y, detailY) - 18;

  // ---- bill to / ship to
  text('Bill to', MARGIN, { font: bold, size: 10 });
  if (order.shippingAddress) {
    text('Ship to', MARGIN + width / 2, { font: bold, size: 10 });
  }
  y -= 14;
  const billTo = [order.customerName, order.email];
  const a = order.shippingAddress;
  const shipTo = a
    ? [
        a.fullName,
        a.line1,
        ...(a.line2 ? [a.line2] : []),
        [a.city, a.state, a.postalCode].filter(Boolean).join(', '),
        a.country,
        a.phone,
      ]
    : [];
  for (let i = 0; i < Math.max(billTo.length, shipTo.length); i += 1) {
    if (billTo[i]) text(billTo[i], MARGIN, { size: 9 });
    if (shipTo[i]) text(shipTo[i], MARGIN + width / 2, { size: 9 });
    y -= 12;
  }
  y -= 14;

  // ---- items
  const cols = {
    item: MARGIN,
    qty: MARGIN + width * 0.62,
    unit: MARGIN + width * 0.8,
    amount: MARGIN + width,
  };
  const header = () => {
    text('Item', cols.item, { font: bold, size: 9, color: MUTED });
    text('Qty', cols.qty, {
      font: bold,
      size: 9,
      color: MUTED,
      align: 'right',
    });
    text('Unit price', cols.unit, {
      font: bold,
      size: 9,
      color: MUTED,
      align: 'right',
    });
    text('Amount', cols.amount, {
      font: bold,
      size: 9,
      color: MUTED,
      align: 'right',
    });
    y -= 8;
    rule();
    y -= 16;
  };
  header();
  for (const item of order.items) {
    const title = wrap(item.titleSnapshot, bold, 10, width * 0.55);
    // Items continue on a new page under the column headings again.
    if (newPageIfNeeded(16 * (title.length + 1))) header();
    text(title[0], cols.item, { font: bold });
    text(String(item.quantity), cols.qty, { align: 'right' });
    text(m(item.unitAmount), cols.unit, { align: 'right' });
    text(m(item.lineTotal), cols.amount, { align: 'right' });
    for (const more of title.slice(1)) {
      y -= 13;
      text(more, cols.item, { font: bold });
    }
    y -= 13;
    text(item.format === 'ebook' ? 'Ebook (PDF)' : 'Print edition', cols.item, {
      size: 9,
      color: MUTED,
    });
    y -= 10;
    rule(0.5);
    y -= 16;
  }

  // ---- totals
  newPageIfNeeded(110);
  const total = (label: string, value: string, strong = false) => {
    text(label, cols.unit, {
      align: 'right',
      font: strong ? bold : regular,
      size: strong ? 11 : 10,
    });
    text(value, cols.amount, {
      align: 'right',
      font: strong ? bold : regular,
      size: strong ? 11 : 10,
    });
    y -= strong ? 18 : 15;
  };
  total('Subtotal', m(order.subtotal));
  if (order.discountTotal > 0) {
    total(
      order.coupon ? `Discount (${order.coupon.code})` : 'Discount',
      `-${m(order.discountTotal)}`,
    );
  }
  if (order.shippingAddress) total('Shipping', m(order.shippingTotal));
  total('Total paid', m(order.total), true);
  if (order.refundedTotal > 0) {
    total('Refunded', `-${m(order.refundedTotal)}`);
    const net = subtract(
      money(order.total, order.currency),
      money(order.refundedTotal, order.currency),
    );
    total('Net paid', m(net.amount), true);
  }

  // ---- footer note
  y -= 16;
  newPageIfNeeded(40);
  text('Prices include any applicable taxes.', MARGIN, {
    size: 9,
    color: MUTED,
  });
  y -= 12;
  text(
    `Thank you for your order. Questions? Contact ${seller.email ?? seller.name}.`,
    MARGIN,
    {
      size: 9,
      color: MUTED,
    },
  );

  doc.setTitle(`Invoice ${order.orderNumber}`);
  doc.setAuthor(encodable(seller.name, regular));
  doc.setCreator(encodable(seller.name, regular));
  doc.setProducer(encodable(seller.name, regular));
  return doc.save();
}

function statusLabel(order: Pick<Order, 'status'>): string {
  switch (order.status) {
    case 'refunded':
      return 'Refunded';
    case 'partially_refunded':
      return 'Paid (partly refunded)';
    default:
      return 'Paid';
  }
}

/** Splits text into lines no wider than `maxWidth` at `size`. */
export function wrap(
  value: string,
  font: PDFFont,
  size: number,
  maxWidth: number,
): string[] {
  const words = encodable(value, font).split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = '';
  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if (font.widthOfTextAtSize(candidate, size) <= maxWidth || !line) {
      line = candidate;
    } else {
      lines.push(line);
      line = word;
    }
  }
  if (line) lines.push(line);
  return lines.length ? lines : [''];
}
