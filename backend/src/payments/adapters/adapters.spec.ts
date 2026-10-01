import { createHmac } from 'node:crypto';
import Stripe from 'stripe';
import { money } from '../../common/money/money.js';
import { FlutterwaveAdapter } from './flutterwave.adapter.js';
import {
  OutcomeUnknownError,
  ProviderRejectedError,
  type Fetch,
} from './payment-adapter.js';
import { PaystackAdapter } from './paystack.adapter.js';
import { StripeAdapter, type StripeClient } from './stripe.adapter.js';

/** A fetch that answers from a queue and records what was sent. */
function fakeFetch(
  ...responses: Array<{ status: number; body: unknown } | Error>
) {
  const calls: Array<{ url: string; init: RequestInit }> = [];
  const impl = ((url: string, init: RequestInit) => {
    calls.push({ url, init });
    const next = responses.shift();
    if (!next) throw new Error('no more fake responses');
    if (next instanceof Error) return Promise.reject(next);
    return Promise.resolve(
      new Response(JSON.stringify(next.body), {
        status: next.status,
        headers: { 'content-type': 'application/json' },
      }),
    );
  }) as unknown as Fetch;
  return {
    impl,
    calls,
    body: (i: number) =>
      JSON.parse(calls[i].init.body as string) as Record<string, unknown>,
  };
}

const params = {
  reference: 'BSP_abc123',
  amount: money(2999, 'USD'),
  customer: { email: 'ada@example.com', name: 'Ada Obi' },
  orderNumber: 'BS-2026-000001',
  description: 'Order BS-2026-000001',
  successUrl:
    'https://books.example.com/checkout/callback?reference=BSP_abc123',
  cancelUrl:
    'https://books.example.com/checkout/callback?reference=BSP_abc123&cancelled=1',
};

describe('PaystackAdapter', () => {
  const secret = 'sk_test_paystack';

  it('sends kobo (minor units) and our reference', async () => {
    const f = fakeFetch({
      status: 200,
      body: {
        status: true,
        data: {
          authorization_url: 'https://checkout.paystack.com/x',
          reference: 'BSP_abc123',
        },
      },
    });
    const adapter = new PaystackAdapter(secret, f.impl);
    const result = await adapter.initiate({
      ...params,
      amount: money(2_500_000, 'NGN'),
    });
    expect(result.redirectUrl).toBe('https://checkout.paystack.com/x');
    expect(f.body(0)).toMatchObject({
      amount: 2_500_000,
      currency: 'NGN',
      reference: 'BSP_abc123',
      email: 'ada@example.com',
    });
  });

  it('passes Paystack’s own refusal to the buyer and treats a 5xx as unknown', async () => {
    const rejected = new PaystackAdapter(
      secret,
      fakeFetch({
        status: 400,
        body: { status: false, message: 'Currency not supported' },
      }).impl,
    );
    await expect(rejected.initiate(params)).rejects.toBeInstanceOf(
      ProviderRejectedError,
    );
    const down = new PaystackAdapter(
      secret,
      fakeFetch({ status: 502, body: {} }).impl,
    );
    await expect(down.initiate(params)).rejects.toBeInstanceOf(
      OutcomeUnknownError,
    );
    const offline = new PaystackAdapter(
      secret,
      fakeFetch(new Error('ECONNRESET')).impl,
    );
    await expect(offline.initiate(params)).rejects.toBeInstanceOf(
      OutcomeUnknownError,
    );
  });

  it('maps verification statuses; abandoned stays pending (the buyer may still pay)', async () => {
    const tx = (status: string) => ({
      status: 200,
      body: {
        status: true,
        data: {
          id: 9,
          status,
          reference: 'BSP_abc123',
          amount: 2_500_000,
          currency: 'NGN',
        },
      },
    });
    const adapter = new PaystackAdapter(
      secret,
      fakeFetch(tx('success'), tx('failed'), tx('abandoned'), {
        status: 404,
        body: { status: false },
      }).impl,
    );
    expect(await adapter.verify('BSP_abc123')).toMatchObject({
      status: 'succeeded',
      amount: { amount: 2_500_000, currency: 'NGN' },
      providerTransactionId: '9',
    });
    expect((await adapter.verify('BSP_abc123')).status).toBe('failed');
    expect((await adapter.verify('BSP_abc123')).status).toBe('pending');
    expect((await adapter.verify('BSP_abc123')).status).toBe('pending');
  });

  it('accepts only webhooks signed with HMAC-SHA512 of the exact raw body', async () => {
    const adapter = new PaystackAdapter(secret);
    const raw = Buffer.from(
      JSON.stringify({
        event: 'charge.success',
        data: {
          id: 9,
          status: 'success',
          reference: 'BSP_abc123',
          amount: 2_500_000,
          currency: 'NGN',
        },
      }),
    );
    const signature = createHmac('sha512', secret).update(raw).digest('hex');
    const envelope = await adapter.parseWebhook(raw, {
      'x-paystack-signature': signature,
    });
    expect(envelope).toMatchObject({
      kind: 'payment',
      result: { status: 'succeeded', reference: 'BSP_abc123' },
    });
    expect(await adapter.parseWebhook(raw, {})).toBeNull();
    expect(
      await adapter.parseWebhook(raw, {
        'x-paystack-signature': 'a'.repeat(128),
      }),
    ).toBeNull();
    // One changed byte in the body breaks the signature.
    const tampered = Buffer.from(raw.toString().replace('2500000', '2500001'));
    expect(
      await adapter.parseWebhook(tampered, {
        'x-paystack-signature': signature,
      }),
    ).toBeNull();
  });

  it('reads refund and dispute events', async () => {
    const adapter = new PaystackAdapter(secret);
    const sign = (body: object) => {
      const raw = Buffer.from(JSON.stringify(body));
      return [
        raw,
        {
          'x-paystack-signature': createHmac('sha512', secret)
            .update(raw)
            .digest('hex'),
        },
      ] as const;
    };
    expect(
      await adapter.parseWebhook(
        ...sign({
          event: 'refund.processed',
          data: {
            id: 77,
            amount: 500_000,
            currency: 'NGN',
            transaction_reference: 'BSP_abc123',
          },
        }),
      ),
    ).toMatchObject({
      kind: 'refund',
      reference: 'BSP_abc123',
      amount: { amount: 500_000 },
      cumulative: false,
      status: 'succeeded',
    });
    expect(
      await adapter.parseWebhook(
        ...sign({
          event: 'charge.dispute.create',
          data: {
            reason: 'fraud',
            transaction: { reference: 'BSP_abc123', id: 9 },
          },
        }),
      ),
    ).toMatchObject({ kind: 'dispute', reference: 'BSP_abc123' });
    expect(
      await adapter.parseWebhook(
        ...sign({ event: 'transfer.success', data: {} }),
      ),
    ).toMatchObject({ kind: 'ignored' });
  });

  it('distinguishes a refused refund from an unknown outcome', async () => {
    const refused = new PaystackAdapter(
      secret,
      fakeFetch({
        status: 400,
        body: { status: false, message: 'Insufficient balance' },
      }).impl,
    );
    expect(
      await refused.refund({
        reference: 'BSP_abc123',
        providerTransactionId: '9',
        providerChargeId: null,
        amount: money(100, 'NGN'),
        idempotencyKey: 'r1',
        reason: 'x',
      }),
    ).toEqual({
      status: 'rejected',
      message: 'Insufficient balance',
    });
    const unknown = new PaystackAdapter(
      secret,
      fakeFetch({ status: 504, body: {} }).impl,
    );
    await expect(
      unknown.refund({
        reference: 'BSP_abc123',
        providerTransactionId: '9',
        providerChargeId: null,
        amount: money(100, 'NGN'),
        idempotencyKey: 'r1',
        reason: 'x',
      }),
    ).rejects.toBeInstanceOf(OutcomeUnknownError);
  });
});

describe('FlutterwaveAdapter', () => {
  const secret = 'FLWSECK_TEST-x';
  const hash = 'our-shared-webhook-hash';

  it('sends MAJOR units, exactly (2999 → 29.99, ₦25,000 → 25000)', async () => {
    const f = fakeFetch(
      {
        status: 200,
        body: {
          status: 'success',
          data: { link: 'https://checkout.flutterwave.com/x' },
        },
      },
      {
        status: 200,
        body: {
          status: 'success',
          data: { link: 'https://checkout.flutterwave.com/y' },
        },
      },
    );
    const adapter = new FlutterwaveAdapter(secret, hash, f.impl);
    await adapter.initiate(params);
    await adapter.initiate({ ...params, amount: money(2_500_000, 'NGN') });
    expect(f.body(0)).toMatchObject({
      amount: 29.99,
      currency: 'USD',
      tx_ref: 'BSP_abc123',
    });
    expect(f.body(1)).toMatchObject({ amount: 25000, currency: 'NGN' });
    expect(f.calls[0].init.body as string).toContain('"amount":29.99');
  });

  it('reads verified major amounts back into exact minor units', async () => {
    const adapter = new FlutterwaveAdapter(
      secret,
      hash,
      fakeFetch({
        status: 200,
        body: {
          status: 'success',
          data: {
            id: 5,
            tx_ref: 'BSP_abc123',
            status: 'successful',
            amount: 29.99,
            currency: 'USD',
          },
        },
      }).impl,
    );
    expect(await adapter.verify('BSP_abc123')).toMatchObject({
      status: 'succeeded',
      amount: { amount: 2999, currency: 'USD' },
      providerTransactionId: '5',
    });
  });

  it('checks the verif-hash, then re-verifies the event with the API instead of trusting its body', async () => {
    const f = fakeFetch({
      status: 200,
      body: {
        status: 'success',
        data: {
          id: 5,
          tx_ref: 'BSP_abc123',
          status: 'failed',
          amount: 29.99,
          currency: 'USD',
        },
      },
    });
    const adapter = new FlutterwaveAdapter(secret, hash, f.impl);
    // The body claims success; the API says failed. The API wins.
    const raw = Buffer.from(
      JSON.stringify({
        event: 'charge.completed',
        data: {
          id: 5,
          tx_ref: 'BSP_abc123',
          status: 'successful',
          amount: 29.99,
        },
      }),
    );
    const envelope = await adapter.parseWebhook(raw, { 'verif-hash': hash });
    expect(envelope).toMatchObject({
      kind: 'payment',
      result: { status: 'failed' },
    });
    expect(f.calls[0].url).toContain('/transactions/5/verify');
    expect(
      await adapter.parseWebhook(raw, { 'verif-hash': 'wrong' }),
    ).toBeNull();
    expect(await adapter.parseWebhook(raw, {})).toBeNull();
  });

  it('refunds in major units against the Flutterwave transaction id', async () => {
    const f = fakeFetch({
      status: 200,
      body: { status: 'success', data: { id: 3, status: 'completed' } },
    });
    const adapter = new FlutterwaveAdapter(secret, hash, f.impl);
    expect(
      await adapter.refund({
        reference: 'BSP_abc123',
        providerTransactionId: '5',
        providerChargeId: null,
        amount: money(1050, 'USD'),
        idempotencyKey: 'r1',
        reason: 'x',
      }),
    ).toEqual({
      status: 'succeeded',
      providerRefundId: '3',
    });
    expect(f.calls[0].url).toContain('/transactions/5/refund');
    expect(f.body(0)).toMatchObject({ amount: 10.5 });
  });

  it('is disabled without both the secret key and the webhook hash', () => {
    expect(new FlutterwaveAdapter(secret, undefined).enabled).toBe(false);
    expect(new FlutterwaveAdapter(secret, hash).enabled).toBe(true);
  });
});

describe('StripeAdapter', () => {
  const webhookSecret = 'whsec_test_secret';
  const real = new Stripe('sk_test_dummy');

  function fakeClient(
    overrides: Partial<{
      session: Partial<Stripe.Checkout.Session>;
      refund: Partial<Stripe.Refund> | Error;
    }> = {},
  ) {
    const created: unknown[] = [];
    const client: StripeClient = {
      checkout: {
        sessions: {
          create: (p, o) => {
            created.push({ p, o });
            return Promise.resolve({
              id: 'cs_test_1',
              url: 'https://checkout.stripe.com/c/pay/cs_test_1',
              ...overrides.session,
            } as Stripe.Checkout.Session);
          },
          retrieve: () =>
            Promise.resolve({
              id: 'cs_test_1',
              client_reference_id: 'BSP_abc123',
              payment_status: 'paid',
              status: 'complete',
              amount_total: 2999,
              currency: 'usd',
              payment_intent: 'pi_1',
              ...overrides.session,
            } as Stripe.Checkout.Session),
        },
      },
      refunds: {
        create: (p, o) => {
          created.push({ p, o });
          if (overrides.refund instanceof Error)
            return Promise.reject(overrides.refund);
          return Promise.resolve({
            id: 're_1',
            status: 'succeeded',
            ...overrides.refund,
          } as Stripe.Refund);
        },
      },
      webhooks: real.webhooks as unknown as StripeClient['webhooks'],
    };
    return { client, created };
  }

  it('creates one line for the exact total in minor units, with our reference and an idempotency key', async () => {
    const { client, created } = fakeClient();
    const adapter = new StripeAdapter('sk_test_x', webhookSecret, client);
    const result = await adapter.initiate(params);
    expect(result).toEqual({
      redirectUrl: 'https://checkout.stripe.com/c/pay/cs_test_1',
      providerTransactionId: 'cs_test_1',
    });
    const { p, o } = created[0] as {
      p: Stripe.Checkout.SessionCreateParams;
      o: Stripe.RequestOptions;
    };
    expect(p.line_items).toEqual([
      {
        quantity: 1,
        price_data: {
          currency: 'usd',
          unit_amount: 2999,
          product_data: { name: 'Order BS-2026-000001' },
        },
      },
    ]);
    expect(p.client_reference_id).toBe('BSP_abc123');
    expect(p.metadata).toMatchObject({ reference: 'BSP_abc123' });
    expect(o.idempotencyKey).toBe('initiate-BSP_abc123');
  });

  it('verifies a paid session with the captured amount and the PaymentIntent for refunds', async () => {
    const adapter = new StripeAdapter(
      'sk_test_x',
      webhookSecret,
      fakeClient().client,
    );
    expect(await adapter.verify('BSP_abc123', 'cs_test_1')).toMatchObject({
      status: 'succeeded',
      amount: { amount: 2999, currency: 'USD' },
      providerChargeId: 'pi_1',
    });
    const expired = new StripeAdapter(
      'sk_test_x',
      webhookSecret,
      fakeClient({ session: { payment_status: 'unpaid', status: 'expired' } })
        .client,
    );
    expect((await expired.verify('BSP_abc123', 'cs_test_1')).status).toBe(
      'failed',
    );
    const open = new StripeAdapter(
      'sk_test_x',
      webhookSecret,
      fakeClient({ session: { payment_status: 'unpaid', status: 'open' } })
        .client,
    );
    expect((await open.verify('BSP_abc123', 'cs_test_1')).status).toBe(
      'pending',
    );
  });

  it('accepts only correctly signed, fresh webhooks (constructEvent)', async () => {
    const adapter = new StripeAdapter(
      'sk_test_x',
      webhookSecret,
      fakeClient().client,
    );
    const payload = JSON.stringify({
      id: 'evt_1',
      object: 'event',
      type: 'checkout.session.completed',
      data: {
        object: {
          id: 'cs_test_1',
          object: 'checkout.session',
          client_reference_id: 'BSP_abc123',
          payment_status: 'paid',
          status: 'complete',
          amount_total: 2999,
          currency: 'usd',
          payment_intent: 'pi_1',
        },
      },
    });
    const good = real.webhooks.generateTestHeaderString({
      payload,
      secret: webhookSecret,
    });
    expect(
      await adapter.parseWebhook(Buffer.from(payload), {
        'stripe-signature': good,
      }),
    ).toMatchObject({
      kind: 'payment',
      eventId: 'evt_1',
      result: {
        status: 'succeeded',
        amount: { amount: 2999, currency: 'USD' },
      },
    });
    const wrongSecret = real.webhooks.generateTestHeaderString({
      payload,
      secret: 'whsec_other',
    });
    expect(
      await adapter.parseWebhook(Buffer.from(payload), {
        'stripe-signature': wrongSecret,
      }),
    ).toBeNull();
    const stale = real.webhooks.generateTestHeaderString({
      payload,
      secret: webhookSecret,
      timestamp: Math.floor(Date.now() / 1000) - 3600,
    });
    expect(
      await adapter.parseWebhook(Buffer.from(payload), {
        'stripe-signature': stale,
      }),
    ).toBeNull();
    expect(await adapter.parseWebhook(Buffer.from(payload), {})).toBeNull();
  });

  it('reports refunds as a running total and disputes by PaymentIntent', async () => {
    const adapter = new StripeAdapter(
      'sk_test_x',
      webhookSecret,
      fakeClient().client,
    );
    const sign = (payload: string) =>
      [
        Buffer.from(payload),
        {
          'stripe-signature': real.webhooks.generateTestHeaderString({
            payload,
            secret: webhookSecret,
          }),
        },
      ] as const;
    const refunded = JSON.stringify({
      id: 'evt_2',
      object: 'event',
      type: 'charge.refunded',
      data: {
        object: {
          object: 'charge',
          amount_refunded: 1000,
          currency: 'usd',
          payment_intent: 'pi_1',
          metadata: {},
        },
      },
    });
    expect(await adapter.parseWebhook(...sign(refunded))).toMatchObject({
      kind: 'refund',
      providerTransactionId: 'pi_1',
      amount: { amount: 1000 },
      cumulative: true,
    });
    const disputed = JSON.stringify({
      id: 'evt_3',
      object: 'event',
      type: 'charge.dispute.created',
      data: {
        object: {
          object: 'dispute',
          payment_intent: 'pi_1',
          reason: 'fraudulent',
        },
      },
    });
    expect(await adapter.parseWebhook(...sign(disputed))).toMatchObject({
      kind: 'dispute',
      providerTransactionId: 'pi_1',
      reason: 'fraudulent',
    });
  });

  it('refunds by PaymentIntent with our idempotency key; 4xx is a refusal, a network error is unknown', async () => {
    const ok = fakeClient();
    const adapter = new StripeAdapter('sk_test_x', webhookSecret, ok.client);
    expect(
      await adapter.refund({
        reference: 'BSP_abc123',
        providerTransactionId: 'cs_test_1',
        providerChargeId: 'pi_1',
        amount: money(500, 'USD'),
        idempotencyKey: 'RF_1',
        reason: 'x',
      }),
    ).toEqual({
      status: 'succeeded',
      providerRefundId: 're_1',
    });
    expect(
      (ok.created[0] as { o: Stripe.RequestOptions }).o.idempotencyKey,
    ).toBe('RF_1');

    const refused = new StripeAdapter(
      'sk_test_x',
      webhookSecret,
      fakeClient({
        refund: Object.assign(new Error('Charge already refunded'), {
          type: 'StripeInvalidRequestError',
          statusCode: 400,
        }),
      }).client,
    );
    expect(
      await refused.refund({
        reference: 'r',
        providerTransactionId: null,
        providerChargeId: 'pi_1',
        amount: money(500, 'USD'),
        idempotencyKey: 'RF_2',
        reason: 'x',
      }),
    ).toEqual({
      status: 'rejected',
      message: 'Charge already refunded',
    });
    const unknown = new StripeAdapter(
      'sk_test_x',
      webhookSecret,
      fakeClient({
        refund: Object.assign(new Error('socket hang up'), {
          type: 'StripeConnectionError',
        }),
      }).client,
    );
    await expect(
      unknown.refund({
        reference: 'r',
        providerTransactionId: null,
        providerChargeId: 'pi_1',
        amount: money(500, 'USD'),
        idempotencyKey: 'RF_3',
        reason: 'x',
      }),
    ).rejects.toBeInstanceOf(OutcomeUnknownError);
  });
});
