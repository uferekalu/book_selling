import {
  fromStatuses,
  InvalidTransitionError,
  nextStatus,
  ORDER_EVENTS,
  transition,
  type OrderEvent,
} from './order-state-machine.js';
import { ORDER_STATUSES, type OrderStatus } from './schemas/order.schema.js';

/** The full expected table: every (status, event) pair, so nothing is allowed by accident. */
const EXPECTED: Record<
  OrderStatus,
  Partial<Record<OrderEvent, OrderStatus>>
> = {
  pending_payment: { pay: 'paid', expire: 'expired', cancel: 'cancelled' },
  paid: {
    fulfil: 'fulfilled',
    refund_partial: 'partially_refunded',
    refund_full: 'refunded',
  },
  fulfilled: { refund_partial: 'partially_refunded', refund_full: 'refunded' },
  expired: { pay: 'paid' },
  cancelled: { pay: 'paid' },
  partially_refunded: {
    refund_partial: 'partially_refunded',
    refund_full: 'refunded',
  },
  refunded: {},
};

describe('order state machine', () => {
  it('matches the exhaustive table for every status and event', () => {
    for (const status of ORDER_STATUSES) {
      for (const event of ORDER_EVENTS) {
        expect([status, event, nextStatus(status, event)]).toEqual([
          status,
          event,
          EXPECTED[status][event] ?? null,
        ]);
      }
    }
  });

  it('honours a late payment on an expired or cancelled order', () => {
    expect(transition('expired', 'pay')).toBe('paid');
    expect(transition('cancelled', 'pay')).toBe('paid');
  });

  it('never pays twice, never expires a paid order, never un-refunds', () => {
    expect(nextStatus('paid', 'pay')).toBeNull();
    expect(nextStatus('paid', 'expire')).toBeNull();
    expect(nextStatus('refunded', 'refund_full')).toBeNull();
    expect(() => transition('refunded', 'pay')).toThrow(InvalidTransitionError);
  });

  it('gives the allowed starting statuses for conditional updates', () => {
    expect(fromStatuses('pay').sort()).toEqual(
      ['cancelled', 'expired', 'pending_payment'].sort(),
    );
    expect(fromStatuses('expire')).toEqual(['pending_payment']);
  });
});
