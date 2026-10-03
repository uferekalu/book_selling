import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import { isCurrency, type Money } from '../../common/money/currency.js';
import { money } from '../../common/money/money.js';
import {
  header,
  providerFetch,
  ProviderRejectedError,
  requestJson,
  type Fetch,
  type InitiateParams,
  type InitiateResult,
  type PaymentAdapter,
  type ProviderResult,
  type RefundParams,
  type RefundResult,
  type WebhookEnvelope,
} from './payment-adapter.js';

const BASE = 'https://api.paystack.co';

interface PaystackResponse<T> {
  status: boolean;
  message?: string;
  data?: T;
}

interface PaystackTransaction {
  id: number;
  status: string;
  reference: string;
  amount: number;
  currency: string;
  gateway_response?: string;
}

/**
 * Paystack Standard (ARCHITECTURE §9.3): amounts in the minor unit (kobo); our reference is
 * Paystack's `reference`; webhooks are signed with HMAC-SHA512 of the raw body using the secret key.
 */
export class PaystackAdapter implements PaymentAdapter {
  readonly provider = 'paystack' as const;
  readonly enabled: boolean;

  constructor(
    private readonly secretKey: string | undefined,
    private readonly fetchImpl: Fetch = providerFetch,
  ) {
    this.enabled = Boolean(secretKey);
  }

  private headers() {
    return {
      Authorization: `Bearer ${this.secretKey}`,
      'Content-Type': 'application/json',
    };
  }

  async initiate(params: InitiateParams): Promise<InitiateResult> {
    const { status, body } = await requestJson<
      PaystackResponse<{ authorization_url: string; reference: string }>
    >(this.fetchImpl, `${BASE}/transaction/initialize`, {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify({
        email: params.customer.email,
        amount: params.amount.amount,
        currency: params.amount.currency,
        reference: params.reference,
        callback_url: params.successUrl,
        metadata: {
          orderNumber: params.orderNumber,
          cancel_action: params.cancelUrl,
        },
      }),
    });
    if (status >= 400 || !body.status || !body.data?.authorization_url) {
      throw new ProviderRejectedError(
        body.message ?? 'Paystack could not start this payment',
      );
    }
    return {
      redirectUrl: body.data.authorization_url,
      providerTransactionId: null,
    };
  }

  async verify(reference: string): Promise<ProviderResult> {
    const { status, body } = await requestJson<
      PaystackResponse<PaystackTransaction>
    >(
      this.fetchImpl,
      `${BASE}/transaction/verify/${encodeURIComponent(reference)}`,
      {
        method: 'GET',
        headers: this.headers(),
      },
    );
    // Not found yet: the buyer hasn't reached Paystack's page. Still pending.
    if (status === 404 || !body.status || !body.data) {
      return pending(reference);
    }
    return toResult(body.data, reference);
  }

  parseWebhook(
    rawBody: Buffer,
    headers: Record<string, string | string[] | undefined>,
  ): Promise<WebhookEnvelope | null> {
    const signature = header(headers, 'x-paystack-signature');
    if (!signature || !this.secretKey) return Promise.resolve(null);
    const expected = createHmac('sha512', this.secretKey)
      .update(rawBody)
      .digest('hex');
    const a = Buffer.from(expected, 'utf8');
    const b = Buffer.from(signature, 'utf8');
    if (a.length !== b.length || !timingSafeEqual(a, b))
      return Promise.resolve(null);

    // Paystack events carry no id of their own; the body hash identifies a delivery.
    const eventId = createHash('sha256').update(rawBody).digest('hex');
    const payload = JSON.parse(rawBody.toString('utf8')) as {
      event: string;
      data: Record<string, unknown>;
    };
    const type = payload.event;
    const data = payload.data ?? {};

    if (type === 'charge.success') {
      const tx = data as unknown as PaystackTransaction;
      return Promise.resolve({
        kind: 'payment',
        eventId,
        type,
        result: toResult(tx, tx.reference),
      });
    }
    if (type === 'refund.processed' || type === 'refund.failed') {
      const transaction = (data.transaction ?? {}) as {
        reference?: string;
        id?: number;
      };
      const reference =
        (data.transaction_reference as string | undefined) ??
        transaction.reference ??
        null;
      return Promise.resolve({
        kind: 'refund',
        eventId,
        type,
        reference,
        providerTransactionId: transaction.id ? String(transaction.id) : null,
        providerRefundId: data.id ? String(data.id as number) : null,
        amount: minor(data.amount, data.currency),
        cumulative: false,
        status: type === 'refund.processed' ? 'succeeded' : 'failed',
      });
    }
    if (type === 'charge.dispute.create') {
      const transaction = (data.transaction ?? {}) as {
        reference?: string;
        id?: number;
      };
      return Promise.resolve({
        kind: 'dispute',
        eventId,
        type,
        reference: transaction.reference ?? null,
        providerTransactionId: transaction.id ? String(transaction.id) : null,
        reason:
          typeof data.reason === 'string'
            ? data.reason
            : typeof data.category === 'string'
              ? data.category
              : 'Dispute opened',
      });
    }
    return Promise.resolve({ kind: 'ignored', eventId, type });
  }

  async refund(params: RefundParams): Promise<RefundResult> {
    const { status, body } = await requestJson<
      PaystackResponse<{ id?: number; status?: string }>
    >(this.fetchImpl, `${BASE}/refund`, {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify({
        transaction: params.reference,
        amount: params.amount.amount,
        currency: params.amount.currency,
        merchant_note: params.reason.slice(0, 200),
      }),
    });
    if (status >= 400 || !body.status) {
      return {
        status: 'rejected',
        message: body.message ?? 'Paystack refused the refund',
      };
    }
    return {
      status: body.data?.status === 'processed' ? 'succeeded' : 'pending',
      providerRefundId: body.data?.id ? String(body.data.id) : null,
    };
  }
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

function minor(amount: unknown, currency: unknown): Money | null {
  return typeof amount === 'number' &&
    Number.isSafeInteger(amount) &&
    isCurrency(currency)
    ? money(amount, currency)
    : null;
}

function toResult(tx: PaystackTransaction, reference: string): ProviderResult {
  const status =
    tx.status === 'success'
      ? 'succeeded'
      : tx.status === 'failed' || tx.status === 'reversed'
        ? 'failed'
        : // 'abandoned', 'ongoing', 'pending', 'processing', 'queued': the buyer may still pay.
          'pending';
  return {
    reference: tx.reference ?? reference,
    status,
    amount: minor(tx.amount, tx.currency),
    providerTransactionId: tx.id ? String(tx.id) : null,
    providerChargeId: null,
    failureReason:
      status === 'failed' ? (tx.gateway_response ?? 'Payment failed') : null,
  };
}
