import { Logger } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { EmailTransport, OutgoingEmail } from './email-transport.js';

/**
 * Development and test transport, used when no RESEND_API_KEY is configured (never in production;
 * env validation requires the key there). It logs the email, including the plain-text body so
 * verification links can be clicked from the terminal, and keeps the last emails in memory for
 * tests.
 */
export class LogTransport implements EmailTransport {
  private readonly logger = new Logger('LogTransport');
  readonly sent: OutgoingEmail[] = [];

  send(email: OutgoingEmail): Promise<{ providerMessageId: string }> {
    this.sent.push(email);
    if (this.sent.length > 50) this.sent.shift();
    const files = (email.attachments ?? [])
      .map((a) => `${a.filename} (${Math.ceil(a.content.length / 1024)} KB)`)
      .join(', ');
    this.logger.log(
      `Email to ${email.to}: "${email.subject}"${files ? ` [attached: ${files}]` : ''}\n${email.text}`,
    );
    return Promise.resolve({ providerMessageId: `log_${randomUUID()}` });
  }
}
