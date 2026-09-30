export interface OutgoingEmail {
  from: string;
  to: string;
  replyTo?: string;
  subject: string;
  html: string;
  text: string;
  /** Sent to the provider so a retried request can never deliver the same email twice. */
  idempotencyKey: string;
  /** Provider tags for filtering in its dashboard (template name, category). */
  tags: Record<string, string>;
  headers?: Record<string, string>;
}

export interface EmailTransport {
  /** Returns the provider's message id. Throws `EmailSendError` on failure. */
  send(email: OutgoingEmail): Promise<{ providerMessageId: string }>;
}

export const EMAIL_TRANSPORT = Symbol('EMAIL_TRANSPORT');

/**
 * `retryable: false` means sending again cannot succeed (invalid address, malformed request),
 * so the outbox gives up at once instead of burning retries.
 */
export class EmailSendError extends Error {
  constructor(
    message: string,
    readonly retryable: boolean,
  ) {
    super(message);
    this.name = 'EmailSendError';
  }
}
