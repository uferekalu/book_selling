import { createHash, timingSafeEqual } from 'node:crypto';
import { isCurrency, type Money } from '../../common/money/currency.js';
import { fromMajor, toMajorString } from '../../common/money/money.js';
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
  type CancelResult,
  type RefundResult,
  type RefundStatus,
  type WebhookEnvelope,
} from './payment-adapter.js';

const BASE = 'https://api.flutterwave.com/v3';

interface FlwResponse<T> {
  status: string;
  message?: string;
  data?: T;
}

interface FlwTransaction {
  id: number;
  tx_ref: string;
  status: string;
  amount: number;
  currency: string;
  processor_response?: string;
}

/**
 * Flutterwave Standard (ARCHITECTURE §9.3). **Amounts are in MAJOR units** both ways, converted
 * exactly by `toMajorString`/`fromMajor`. The webhook "verif-hash" only proves the sender knows a
 * shared secret, so every webhook is re-verified with `GET /transactions/:id/verify`.
 */
export class FlutterwaveAdapter implements PaymentAdapter {
  readonly provider = 'flutterwave' as const;
  readonly enabled: boolean;

  constructor(
    private readonly secretKey: string | undefined,
    private readonly webhookHash: string | undefined,
    private readonly fetchImpl: Fetch = providerFetch,
  ) {
    this.enabled = Boolean(secretKey && webhookHash);
  }

  private headers() {
    return {
      Authorization: `Bearer ${this.secretKey}`,
      'Content-Type': 'application/json',
    };
  }

  async initiate(params: InitiateParams): Promise<InitiateResult> {
    const { status, body } = await requestJson<FlwResponse<{ link: string }>>(
      this.fetchImpl,
      `${BASE}/payments`,
      {
        method: 'POST',
        headers: this.headers(),
        body: JSON.stringify({
          tx_ref: params.reference,
          // Major units, exactly: 2999 → 29.99.
          amount: Number(toMajorString(params.amount)),
          currency: params.amount.currency,
          redirect_url: params.successUrl,
          customer: {
            email: params.customer.email,
            name: params.customer.name,
          },
          customizations: { title: params.description },
          meta: { orderNumber: params.orderNumber },
        }),
      },
    );
    if (status >= 400 || body.status !== 'success' || !body.data?.link) {
      throw new ProviderRejectedError(
        body.message ?? 'Flutterwave could not start this payment',
      );
    }
    return { redirectUrl: body.data.link, providerTransactionId: null };
  }

  async verify(reference: string): Promise<ProviderResult> {
    const { status, body } = await requestJson<FlwResponse<FlwTransaction>>(
      this.fetchImpl,
      `${BASE}/transactions/verify_by_reference?tx_ref=${encodeURIComponent(reference)}`,
      { method: 'GET', headers: this.headers() },
    );
    if (status === 404 || body.status !== 'success' || !body.data) {
      return pending(reference);
    }
    return toResult(body.data, reference);
  }

  private async verifyById(
    id: string,
    reference: string,
  ): Promise<ProviderResult> {
    const { status, body } = await requestJson<FlwResponse<FlwTransaction>>(
      this.fetchImpl,
      `${BASE}/transactions/${encodeURIComponent(id)}/verify`,
      { method: 'GET', headers: this.headers() },
    );
    if (status >= 400 || body.status !== 'success' || !body.data)
      return pending(reference);
    return toResult(body.data, reference);
  }

  async parseWebhook(
    rawBody: Buffer,
    headers: Record<string, string | string[] | undefined>,
  ): Promise<WebhookEnvelope | null> {
    const signature = header(headers, 'verif-hash');
    if (!signature || !this.webhookHash) return null;
    const a = Buffer.from(signature, 'utf8');
    const b = Buffer.from(this.webhookHash, 'utf8');
    if (a.length !== b.length || !timingSafeEqual(a, b)) return null;

    const eventId = createHash('sha256').update(rawBody).digest('hex');
    const payload = JSON.parse(rawBody.toString('utf8')) as {
      event?: string;
      'event.type'?: string;
      data?: { id?: number; tx_ref?: string };
    };
    const type = payload.event ?? payload['event.type'] ?? 'unknown';
    if (type === 'charge.completed' && payload.data?.id) {
      // Never trust the body's status or amount: ask Flutterwave directly.
      const result = await this.verifyById(
        String(payload.data.id),
        payload.data.tx_ref ?? '',
      );
      return { kind: 'payment', eventId, type, result };
    }
    return { kind: 'ignored', eventId, type };
  }

  async refund(params: RefundParams): Promise<RefundResult> {
    if (!params.providerTransactionId) {
      return {
        status: 'rejected',
        message: 'The Flutterwave transaction id is unknown',
      };
    }
    const { status, body } = await requestJson<
      FlwResponse<{ id?: number; status?: string }>
    >(
      this.fetchImpl,
      `${BASE}/transactions/${encodeURIComponent(params.providerTransactionId)}/refund`,
      {
        method: 'POST',
        headers: this.headers(),
        body: JSON.stringify({
          amount: Number(toMajorString(params.amount)),
          comments: params.reason.slice(0, 200),
        }),
      },
    );
    if (status >= 400 || body.status !== 'success') {
      return {
        status: 'rejected',
        message: body.message ?? 'Flutterwave refused the refund',
      };
    }
    return {
      status: body.data?.status === 'completed' ? 'succeeded' : 'pending',
      providerRefundId: body.data?.id ? String(body.data.id) : null,
    };
  }

  /**
   * GET /refunds/:id. Flutterwave sends no refund webhook we rely on, so this is how a refund it
   * accepted as pending is ever confirmed (BS-26).
   */
  async refundStatus(providerRefundId: string): Promise<RefundStatus> {
    const { status, body } = await requestJson<
      FlwResponse<{ status?: string }>
    >(
      this.fetchImpl,
      `${BASE}/refunds/${encodeURIComponent(providerRefundId)}`,
      { method: 'GET', headers: this.headers() },
    );
    if (status >= 400 || body.status !== 'success' || !body.data)
      return 'pending';
    const state = body.data.status?.toLowerCase();
    if (state === 'completed' || state === 'successful') return 'succeeded';
    return state === 'failed' ? 'failed' : 'pending';
  }

  /** Flutterwave keeps a payment link payable; a late payment is honoured by settle(). */
  cancel(): Promise<CancelResult> {
    return Promise.resolve('unsupported');
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

function toResult(tx: FlwTransaction, reference: string): ProviderResult {
  const status =
    tx.status === 'successful'
      ? 'succeeded'
      : tx.status === 'failed'
        ? 'failed'
        : 'pending';
  let amount: Money | null = null;
  if (isCurrency(tx.currency)) {
    try {
      amount = fromMajor(tx.amount, tx.currency);
    } catch {
      amount = null; // an unreadable amount never settles (the amount check fails safe)
    }
  }
  return {
    reference: tx.tx_ref || reference,
    status,
    amount,
    providerTransactionId: tx.id ? String(tx.id) : null,
    providerChargeId: null,
    failureReason:
      status === 'failed' ? (tx.processor_response ?? 'Payment failed') : null,
  };
}
