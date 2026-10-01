import Stripe from 'stripe';
import { isCurrency, type Money } from '../../common/money/currency.js';
import { money } from '../../common/money/money.js';
import {
  header,
  OutcomeUnknownError,
  ProviderRejectedError,
  type InitiateParams,
  type InitiateResult,
  type PaymentAdapter,
  type ProviderResult,
  type RefundParams,
  type RefundResult,
  type WebhookEnvelope,
} from './payment-adapter.js';

/** The parts of the Stripe SDK used here (tests pass a fake with the same shape). */
export interface StripeClient {
  checkout: {
    sessions: {
      create(
        params: Stripe.Checkout.SessionCreateParams,
        options?: Stripe.RequestOptions,
      ): Promise<
        Stripe.Checkout.Session | Stripe.Response<Stripe.Checkout.Session>
      >;
      retrieve(
        id: string,
      ): Promise<
        Stripe.Checkout.Session | Stripe.Response<Stripe.Checkout.Session>
      >;
    };
  };
  refunds: {
    create(
      params: Stripe.RefundCreateParams,
      options?: Stripe.RequestOptions,
    ): Promise<Stripe.Refund | Stripe.Response<Stripe.Refund>>;
  };
  webhooks: {
    constructEvent(
      payload: Buffer,
      header: string,
      secret: string,
      tolerance?: number,
    ): Stripe.Event;
  };
}

/** Stripe's hosted page stays open this long; a payment after our order window is still honoured. */
const SESSION_MINUTES = 60;

/**
 * Stripe Checkout (ARCHITECTURE §9.3): minor units, lower-case currency; our reference is the
 * session's `client_reference_id` and metadata; webhooks verified by `constructEvent` with a
 * 5-minute tolerance.
 */
export class StripeAdapter implements PaymentAdapter {
  readonly provider = 'stripe' as const;
  readonly enabled: boolean;
  private readonly client: StripeClient | null;

  constructor(
    secretKey: string | undefined,
    private readonly webhookSecret: string | undefined,
    client?: StripeClient,
  ) {
    this.enabled = Boolean(secretKey && webhookSecret);
    this.client =
      client ??
      (secretKey
        ? (new Stripe(secretKey, {
            maxNetworkRetries: 2,
            timeout: 20_000,
          }) as unknown as StripeClient)
        : null);
  }

  private stripe(): StripeClient {
    if (!this.client)
      throw new ProviderRejectedError('Stripe is not configured');
    return this.client;
  }

  async initiate(params: InitiateParams): Promise<InitiateResult> {
    try {
      const session = await this.stripe().checkout.sessions.create(
        {
          mode: 'payment',
          line_items: [
            {
              quantity: 1,
              price_data: {
                currency: params.amount.currency.toLowerCase(),
                // The exact order total (discount and shipping included), in minor units.
                unit_amount: params.amount.amount,
                product_data: { name: params.description },
              },
            },
          ],
          client_reference_id: params.reference,
          customer_email: params.customer.email,
          metadata: {
            reference: params.reference,
            orderNumber: params.orderNumber,
          },
          payment_intent_data: {
            metadata: {
              reference: params.reference,
              orderNumber: params.orderNumber,
            },
          },
          success_url: params.successUrl,
          cancel_url: params.cancelUrl,
          expires_at: Math.floor(Date.now() / 1000) + SESSION_MINUTES * 60,
        },
        { idempotencyKey: `initiate-${params.reference}` },
      );
      if (!session.url)
        throw new ProviderRejectedError(
          'Stripe did not return a checkout page',
        );
      return { redirectUrl: session.url, providerTransactionId: session.id };
    } catch (error) {
      throw translate(error);
    }
  }

  async verify(
    reference: string,
    providerTransactionId: string | null,
  ): Promise<ProviderResult> {
    if (!providerTransactionId) return pending(reference);
    let session: Stripe.Checkout.Session;
    try {
      session = await this.stripe().checkout.sessions.retrieve(
        providerTransactionId,
      );
    } catch (error) {
      throw translate(error);
    }
    return fromSession(session, reference);
  }

  parseWebhook(
    rawBody: Buffer,
    headers: Record<string, string | string[] | undefined>,
  ): Promise<WebhookEnvelope | null> {
    const signature = header(headers, 'stripe-signature');
    if (!signature || !this.webhookSecret || !this.client)
      return Promise.resolve(null);
    let event: Stripe.Event;
    try {
      event = this.client.webhooks.constructEvent(
        rawBody,
        signature,
        this.webhookSecret,
        300,
      );
    } catch {
      return Promise.resolve(null);
    }
    const { id: eventId, type } = event;

    switch (type) {
      case 'checkout.session.completed':
      case 'checkout.session.async_payment_succeeded':
      case 'checkout.session.async_payment_failed':
      case 'checkout.session.expired': {
        const session = event.data.object;
        const reference =
          session.client_reference_id ?? session.metadata?.reference ?? '';
        return Promise.resolve({
          kind: 'payment',
          eventId,
          type,
          result: fromSession(session, reference),
        });
      }
      case 'charge.refunded': {
        const charge = event.data.object;
        return Promise.resolve({
          kind: 'refund',
          eventId,
          type,
          reference: charge.metadata?.reference ?? null,
          providerTransactionId: idOf(charge.payment_intent),
          providerRefundId: null,
          amount: minor(charge.amount_refunded, charge.currency),
          cumulative: true,
          status: 'succeeded',
        });
      }
      case 'charge.dispute.created': {
        const dispute = event.data.object;
        return Promise.resolve({
          kind: 'dispute',
          eventId,
          type,
          reference: null,
          providerTransactionId: idOf(dispute.payment_intent),
          reason: dispute.reason ?? 'Dispute opened',
        });
      }
      default:
        return Promise.resolve({ kind: 'ignored', eventId, type });
    }
  }

  async refund(params: RefundParams): Promise<RefundResult> {
    if (!params.providerChargeId) {
      return { status: 'rejected', message: 'The Stripe payment is unknown' };
    }
    try {
      const refund = await this.stripe().refunds.create(
        {
          payment_intent: params.providerChargeId,
          amount: params.amount.amount,
          reason: 'requested_by_customer',
          metadata: {
            reference: params.reference,
            refundId: params.idempotencyKey,
          },
        },
        { idempotencyKey: params.idempotencyKey },
      );
      if (refund.status === 'failed' || refund.status === 'canceled') {
        return {
          status: 'rejected',
          message: refund.failure_reason ?? 'Stripe refused the refund',
        };
      }
      return {
        status: refund.status === 'succeeded' ? 'succeeded' : 'pending',
        providerRefundId: refund.id,
      };
    } catch (error) {
      const translated = translate(error);
      if (translated instanceof ProviderRejectedError) {
        return { status: 'rejected', message: translated.message };
      }
      throw translated;
    }
  }
}

const idOf = (value: string | { id: string } | null | undefined) =>
  typeof value === 'string' ? value : (value?.id ?? null);

function minor(
  amount: number | null | undefined,
  currency: string | null | undefined,
): Money | null {
  const code = currency?.toUpperCase();
  return typeof amount === 'number' &&
    Number.isSafeInteger(amount) &&
    isCurrency(code)
    ? money(amount, code)
    : null;
}

function pending(reference: string): ProviderResult {
  return {
    reference,
    status: 'pending',
    amount: null,
    providerTransactionId: null,
    providerChargeId: null,
    failureReason: null,
  };
}

function fromSession(
  session: Stripe.Checkout.Session,
  reference: string,
): ProviderResult {
  const status =
    session.payment_status === 'paid' ||
    session.payment_status === 'no_payment_required'
      ? 'succeeded'
      : session.status === 'expired'
        ? 'failed'
        : 'pending';
  return {
    reference: session.client_reference_id ?? reference,
    status:
      session.payment_status === 'no_payment_required' ? 'failed' : status,
    amount: minor(session.amount_total, session.currency),
    providerTransactionId: session.id,
    providerChargeId: idOf(session.payment_intent),
    failureReason: status === 'failed' ? 'The payment page expired' : null,
  };
}

/** Stripe's 4xx is a definite "no" the buyer can act on; anything else is unknown. */
function translate(error: unknown): Error {
  if (
    error instanceof ProviderRejectedError ||
    error instanceof OutcomeUnknownError
  )
    return error;
  const e = error as { type?: string; statusCode?: number; message?: string };
  if (
    e.type === 'StripeCardError' ||
    e.type === 'StripeInvalidRequestError' ||
    (typeof e.statusCode === 'number' &&
      e.statusCode >= 400 &&
      e.statusCode < 500)
  ) {
    return new ProviderRejectedError(e.message ?? 'Stripe refused the request');
  }
  return new OutcomeUnknownError(e.message ?? 'Stripe did not answer');
}
