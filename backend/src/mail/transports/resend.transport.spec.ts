import { EmailSendError } from './email-transport.js';
import { ResendTransport, isPermanentResendError } from './resend.transport.js';

const email = {
  from: 'Books <books@example.com>',
  to: 'ada@example.com',
  subject: 'Hello',
  html: '<p>Hi</p>',
  text: 'Hi',
  idempotencyKey: 'outbox-123',
  tags: { template: 'auth.verify-email', category: 'critical' },
};

describe('ResendTransport', () => {
  let send: ReturnType<typeof vi.fn>;
  let transport: ResendTransport;

  beforeEach(() => {
    transport = new ResendTransport('re_test');
    send = vi.fn();
    (
      transport as unknown as { client: { emails: { send: unknown } } }
    ).client.emails.send = send;
  });

  it('sends with the idempotency key and sanitised tags, returning the message id', async () => {
    send.mockResolvedValue({
      data: { id: 'msg_1' },
      error: null,
      headers: null,
    });
    await expect(transport.send(email)).resolves.toEqual({
      providerMessageId: 'msg_1',
    });
    const [payload, options] = send.mock.calls[0];
    expect(options).toEqual({ idempotencyKey: 'outbox-123' });
    expect(payload.tags).toEqual([
      { name: 'template', value: 'auth_verify-email' },
      { name: 'category', value: 'critical' },
    ]);
    expect(payload.text).toBe('Hi');
  });

  it('marks validation errors as permanent', async () => {
    send.mockResolvedValue({
      data: null,
      error: {
        name: 'validation_error',
        message: 'Invalid `to` field',
        statusCode: 422,
      },
      headers: null,
    });
    const error = await transport.send(email).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(EmailSendError);
    expect((error as EmailSendError).retryable).toBe(false);
  });

  it.each([
    'rate_limit_exceeded',
    'internal_server_error',
    'daily_quota_exceeded',
    'invalid_api_key',
  ])('marks %s as retryable', async (name) => {
    send.mockResolvedValue({
      data: null,
      error: { name, message: 'x', statusCode: 500 },
      headers: null,
    });
    const error = (await transport
      .send(email)
      .catch((e: unknown) => e)) as EmailSendError;
    expect(error.retryable).toBe(true);
  });

  it('treats a thrown network error as retryable', async () => {
    send.mockRejectedValue(new Error('ETIMEDOUT'));
    const error = (await transport
      .send(email)
      .catch((e: unknown) => e)) as EmailSendError;
    expect(error.retryable).toBe(true);
    expect(error.message).toContain('ETIMEDOUT');
  });

  it('classifies error codes', () => {
    expect(isPermanentResendError('invalid_from_address')).toBe(true);
    expect(isPermanentResendError('application_error')).toBe(false);
  });
});
