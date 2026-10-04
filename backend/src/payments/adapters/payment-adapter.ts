import { Agent, fetch as undiciFetch } from 'undici';
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
  /**
   * Where a refund we started stands now, by the provider's refund id (BS-26). Lets reconciliation
   * finish refunds whose webhook never came (Flutterwave sends none we use). Throws when the
   * provider can't be reached; the next run asks again.
   */
  refundStatus(providerRefundId: string): Promise<RefundStatus>;
  /**
   * Closes the provider's payment page for an attempt, where the provider supports it (Stripe), so
   * a released order can't be paid on an old tab. `completed`: it was already paid (settle it);
   * `unsupported`: the provider keeps the page open (a late payment is still honoured).
   */
  cancel(
    reference: string,
    providerTransactionId: string | null,
  ): Promise<CancelResult>;
}

export type RefundStatus = 'succeeded' | 'pending' | 'failed';
export type CancelResult = 'cancelled' | 'completed' | 'unsupported';

/** The provider rejected the request in a way the buyer can act on ("amount below minimum"). */
export class ProviderRejectedError extends Error {}

/**
 * The provider's answer is unknown (timeout, 5xx, network). For refunds this is never retried
 * automatically: an admin checks the provider dashboard (ARCHITECTURE §8.7).
 */
export class OutcomeUnknownError extends Error {}

export type Fetch = typeof fetch;

/**
 * Node's built-in fetch gives up on opening a connection after 10 seconds. From a slow or
 * congested network (seen from Lagos: Paystack and Flutterwave sit behind Cloudflare and the TLS
 * handshake sometimes took longer) that failed real payments with "fetch failed" (BS-23). The
 * providers get 30 seconds to connect; the whole request still has its own overall timeout.
 */
const providerAgent = new Agent({ connect: { timeout: 30_000 } });

export const providerFetch: Fetch = ((
  input: Parameters<Fetch>[0],
  init?: RequestInit,
) =>
  undiciFetch(
    input as never,
    {
      ...(init as object),
      dispatcher: providerAgent,
    } as never,
  )) as unknown as Fetch;

/**
 * Failures before the request was sent: retrying them can't do anything twice (the provider never
 * saw the first attempt), so they are retried even for payments and refunds.
 */
const NOT_SENT = new Set([
  'UND_ERR_CONNECT_TIMEOUT',
  'ECONNREFUSED',
  'ENOTFOUND',
  'EAI_AGAIN',
  'ENETUNREACH',
  'EHOSTUNREACH',
]);

function notSentCode(error: unknown): string | null {
  const cause = (error as { cause?: { code?: string } }).cause;
  const code = cause?.code ?? (error as { code?: string }).code;
  return code && NOT_SENT.has(code) ? code : null;
}

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export function header(
  headers: Record<string, string | string[] | undefined>,
  name: string,
): string | undefined {
  const value = headers[name.toLowerCase()];
  return Array.isArray(value) ? value[0] : value;
}

/**
 * JSON request that separates "the provider said no" from "we don't know what happened". A
 * connection that couldn't be opened is retried (up to `attempts` times in all); anything that may
 * have reached the provider is reported as an unknown outcome, never retried here.
 */
export async function requestJson<T>(
  fetchImpl: Fetch,
  url: string,
  init: RequestInit,
  timeoutMs = 45_000,
  { attempts = 3, retryDelayMs = 1_000 } = {},
): Promise<{ status: number; body: T }> {
  let response: Response | null = null;
  for (let attempt = 1; !response; attempt += 1) {
    try {
      response = await fetchImpl(url, {
        ...init,
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (error) {
      const code = notSentCode(error);
      if (code && attempt < attempts) {
        await wait(retryDelayMs * attempt);
        continue;
      }
      throw new OutcomeUnknownError(
        code
          ? `Couldn't connect to the provider (${code}) after ${attempt} attempts`
          : `Network error: ${(error as Error).message}`,
      );
    }
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
