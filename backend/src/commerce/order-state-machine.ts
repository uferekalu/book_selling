import type { OrderStatus } from './schemas/order.schema.js';

/**
 * Every allowed order status change (ARCHITECTURE §8.4), and nothing else. Writes use the
 * `from` status as a condition (`findOneAndUpdate({ _id, status: from }, …)`), so two concurrent
 * actors can never both apply a transition.
 */
export const ORDER_EVENTS = [
  'pay',
  'expire',
  'cancel',
  'fulfil',
  'refund_partial',
  'refund_full',
] as const;
export type OrderEvent = (typeof ORDER_EVENTS)[number];

const TRANSITIONS: Record<
  OrderEvent,
  Partial<Record<OrderStatus, OrderStatus>>
> = {
  // A payment confirmed after expiry is honoured, never ignored (§8.4).
  pay: { pending_payment: 'paid', expired: 'paid', cancelled: 'paid' },
  expire: { pending_payment: 'expired' },
  cancel: { pending_payment: 'cancelled' },
  fulfil: { paid: 'fulfilled' },
  refund_partial: {
    paid: 'partially_refunded',
    fulfilled: 'partially_refunded',
    partially_refunded: 'partially_refunded',
  },
  refund_full: {
    paid: 'refunded',
    fulfilled: 'refunded',
    partially_refunded: 'refunded',
  },
};

export class InvalidTransitionError extends Error {
  constructor(
    readonly from: OrderStatus,
    readonly event: OrderEvent,
  ) {
    super(`Order in "${from}" cannot "${event}"`);
  }
}

/** The status after `event`, or null when it isn't allowed from `from`. */
export function nextStatus(
  from: OrderStatus,
  event: OrderEvent,
): OrderStatus | null {
  return TRANSITIONS[event][from] ?? null;
}

/** The statuses an event may start from, for the condition of an atomic update. */
export function fromStatuses(event: OrderEvent): OrderStatus[] {
  return Object.keys(TRANSITIONS[event]) as OrderStatus[];
}

export function transition(from: OrderStatus, event: OrderEvent): OrderStatus {
  const to = nextStatus(from, event);
  if (!to) throw new InvalidTransitionError(from, event);
  return to;
}

/** Final states: nothing but refunds can follow, and only from paid states. */
export const isOpen = (status: OrderStatus) => status === 'pending_payment';
export const isPaidLike = (status: OrderStatus) =>
  status === 'paid' ||
  status === 'fulfilled' ||
  status === 'partially_refunded' ||
  status === 'refunded';
