import type { Money } from '../../common/money/currency.js';
import type { Provider } from '../schemas/payment.schema.js';

/**
 * Every provider looks the same to the rest of the system (ARCHITECTURE §9.1). Nothing outside
 * `PaymentsService` branches on the provider's name.
 */

export interface InitiateParams {
  /** Our reference (`BSP_…`); the provider echoes it back on verify and in webhooks. */
  reference: string;
  amount: Money;
  customer: { email: string; name: string };
  orderNumber: string;
  description: string;
  successUrl: string;
  cancelUrl: string;
}

export interface InitiateResult {
  redirectUrl: string;
  providerTransactionId: string | null;
}

/** What the provider says happened, in OUR terms (minor units, our reference). */
export interface ProviderResult {
  reference: string;
  status: 'succeeded' | 'failed' | 'pending';
  /** Present when the provider reports what it captured. */
  amount: Money | null;
  providerTransactionId: string | null;
  /** Stripe's PaymentIntent (refunds); null elsewhere. */
  providerChargeId: string | null;
  failureReason: string | null;
}

export type WebhookEnvelope =
  | { kind: 'payment'; eventId: string; type: string; result: ProviderResult }
  | {
      kind: 'refund';
      eventId: string;
      type: string;
      /** Our payment reference, or the provider's transaction id when that's all it gives. */
      reference: string | null;
      providerTransactionId: string | null;
      providerRefundId: string | null;
      amount: Money | null;
      /** True when `amount` is the total refunded so far (Stripe), false for one refund. */
      cumulative: boolean;
      status: 'succeeded' | 'failed';
    }
  | {
      kind: 'dispute';
      eventId: string;
      type: string;
      reference: string | null;
      providerTransactionId: string | null;
      reason: string;
    }
  | { kind: 'ignored'; eventId: string; type: string };

export interface RefundParams {
  reference: string;
  providerTransactionId: string | null;
  providerChargeId: string | null;
  amount: Money;
  /** Our refund id: sent as the provider's idempotency key where supported. */
  idempotencyKey: string;
  reason: string;
}

export type RefundResult =
  | { status: 'succeeded' | 'pending'; providerRefundId: string | null }
  | { status: 'rejected'; message: string };

export interface PaymentAdapter {
  readonly provider: Provider;
  /** Configured with keys (otherwise the provider is offered to nobody). */
  readonly enabled: boolean;
  initiate(params: InitiateParams): Promise<InitiateResult>;
  /** Server-to-server check with the secret key: the only trusted source besides webhooks. */
  verify(
    reference: string,
    providerTransactionId: string | null,
  ): Promise<ProviderResult>;
  /** `null` = signature missing or invalid (the caller answers 401). */
  parseWebhook(
    rawBody: Buffer,
    headers: Record<string, string | string[] | undefined>,
  ): Promise<WebhookEnvelope | null>;
  refund(params: RefundParams): Promise<RefundResult>;
}

/** The provider rejected the request in a way the buyer can act on ("amount below minimum"). */
export class ProviderRejectedError extends Error {}

/**
 * The provider's answer is unknown (timeout, 5xx, network). For refunds this is never retried
 * automatically: an admin checks the provider dashboard (ARCHITECTURE §8.7).
 */
export class OutcomeUnknownError extends Error {}

export type Fetch = typeof fetch;

export function header(
  headers: Record<string, string | string[] | undefined>,
  name: string,
): string | undefined {
  const value = headers[name.toLowerCase()];
  return Array.isArray(value) ? value[0] : value;
}

/** JSON request that separates "the provider said no" from "we don't know what happened". */
export async function requestJson<T>(
  fetchImpl: Fetch,
  url: string,
  init: RequestInit,
  timeoutMs = 20_000,
): Promise<{ status: number; body: T }> {
  let response: Response;
  try {
    response = await fetchImpl(url, {
      ...init,
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (error) {
    throw new OutcomeUnknownError(`Network error: ${(error as Error).message}`);
  }
  if (response.status >= 500) {
    throw new OutcomeUnknownError(`Provider error ${response.status}`);
  }
  let body: T;
  try {
    body = (await response.json()) as T;
  } catch {
    throw new OutcomeUnknownError(`Unreadable response (${response.status})`);
  }
  return { status: response.status, body };
}
