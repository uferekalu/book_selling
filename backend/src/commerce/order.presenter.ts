import type { OrderDocument } from './schemas/order.schema.js';

/** The order shape that leaves the API (customer and guest views). No internal ids or hashes. */
export function presentOrder(order: OrderDocument) {
  const now = Date.now();
  const awaitingPayment =
    order.status === 'pending_payment' &&
    !!order.expiresAt &&
    order.expiresAt.getTime() > now;
  return {
    orderNumber: order.orderNumber,
    status: order.status,
    awaitingPayment,
    createdAt: (
      order as unknown as { createdAt: Date }
    ).createdAt.toISOString(),
    expiresAt: awaitingPayment ? order.expiresAt!.toISOString() : null,
    email: order.email,
    customerName: order.customerName,
    currency: order.currency,
    items: order.items.map((item) => ({
      bookId: item.bookId.toString(),
      slug: item.slugSnapshot,
      title: item.titleSnapshot,
      cover: item.coverSnapshot,
      format: item.format,
      unitAmount: item.unitAmount,
      quantity: item.quantity,
      lineTotal: item.lineTotal,
    })),
    subtotal: order.subtotal,
    discountTotal: order.discountTotal,
    shippingTotal: order.shippingTotal,
    taxTotal: order.taxTotal,
    total: order.total,
    refundedTotal: order.refundedTotal,
    coupon: order.coupon ? { code: order.coupon.code } : null,
    shippingAddress: order.shippingAddress
      ? {
          fullName: order.shippingAddress.fullName,
          phone: order.shippingAddress.phone,
          line1: order.shippingAddress.line1,
          line2: order.shippingAddress.line2,
          city: order.shippingAddress.city,
          state: order.shippingAddress.state,
          postalCode: order.shippingAddress.postalCode,
          country: order.shippingAddress.country,
        }
      : null,
    shippingEstimate: order.shippingEstimate,
    shipment: {
      status: order.shipment.status,
      carrier: order.shipment.carrier,
      trackingNumber: order.shipment.trackingNumber,
      trackingUrl: order.shipment.trackingUrl,
      shippedAt: order.shipment.shippedAt?.toISOString() ?? null,
      deliveredAt: order.shipment.deliveredAt?.toISOString() ?? null,
    },
    paidAt: order.payment?.paidAt?.toISOString() ?? null,
    returnPath: order.returnPath,
    history: order.statusHistory.map((h) => ({
      status: h.status,
      at: h.at.toISOString(),
    })),
  };
}

export type OrderView = ReturnType<typeof presentOrder>;
