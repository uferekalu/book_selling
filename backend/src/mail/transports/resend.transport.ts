import { Resend } from 'resend';
import {
  EmailSendError,
  type EmailTransport,
  type OutgoingEmail,
} from './email-transport.js';

/**
 * Resend error codes where retrying can never help: the request itself is wrong. Everything
 * else (rate limits, quota, 5xx, a revoked or misconfigured API key the owner can fix) is
 * retried, so no email is lost to a fixable condition.
 */
const PERMANENT_ERRORS = new Set([
  'validation_error',
  'missing_required_field',
  'invalid_parameter',
  'invalid_from_address',
  'invalid_attachment',
  'invalid_idempotency_key',
  // Same idempotency key with a different payload: the stored row changed, so resending is unsafe.
  'invalid_idempotent_request',
]);

export function isPermanentResendError(name: string): boolean {
  return PERMANENT_ERRORS.has(name);
}

export class ResendTransport implements EmailTransport {
  private readonly client: Resend;

  constructor(apiKey: string) {
    this.client = new Resend(apiKey);
  }

  async send(email: OutgoingEmail): Promise<{ providerMessageId: string }> {
    let response: Awaited<ReturnType<Resend['emails']['send']>>;
    try {
      response = await this.client.emails.send(
        {
          from: email.from,
          to: email.to,
          replyTo: email.replyTo,
          subject: email.subject,
          html: email.html,
          text: email.text,
          headers: email.headers,
          ...(email.attachments?.length
            ? {
                attachments: email.attachments.map((a) => ({
                  filename: a.filename,
                  content: a.content,
                  contentType: a.contentType,
                })),
              }
            : {}),
          tags: Object.entries(email.tags).map(([name, value]) => ({
            name,
            // Resend tag values allow only ASCII letters, numbers, underscores and dashes.
            value: value.replace(/[^A-Za-z0-9_-]/g, '_'),
          })),
        },
        { idempotencyKey: email.idempotencyKey },
      );
    } catch (error) {
      // Network failure or timeout: the outcome is unknown, but the idempotency key makes a
      // retry safe.
      throw new EmailSendError(
        `Resend request failed: ${(error as Error).message}`,
        true,
      );
    }
    if (response.error) {
      throw new EmailSendError(
        `Resend ${response.error.name}: ${response.error.message}`,
        !isPermanentResendError(response.error.name),
      );
    }
    return { providerMessageId: response.data.id };
  }
}
