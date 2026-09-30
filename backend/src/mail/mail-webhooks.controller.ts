import {
  BadRequestException,
  Controller,
  Headers,
  HttpCode,
  Logger,
  Post,
  Req,
  UnauthorizedException,
  type RawBodyRequest,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiExcludeController } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import type { Request } from 'express';
import { Webhook } from 'svix';
import { Public } from '../common/decorators/public.decorator.js';
import {
  MailWebhooksService,
  type ResendEmailEvent,
} from './mail-webhooks.service.js';

/**
 * Resend delivery webhooks, signed with Svix. The signature is checked against the exact raw
 * body (main.ts `rawBody: true`). Anything unsigned is rejected before it can touch the database.
 */
@ApiExcludeController()
@Controller('mail/webhooks')
export class MailWebhooksController {
  private readonly logger = new Logger(MailWebhooksController.name);
  private readonly verifier: Webhook | null;

  constructor(
    config: ConfigService,
    private readonly webhooks: MailWebhooksService,
  ) {
    const secret = config.get<string>('RESEND_WEBHOOK_SECRET');
    this.verifier = secret ? new Webhook(secret) : null;
  }

  @Public()
  @SkipThrottle()
  @Post('resend')
  @HttpCode(200)
  async resend(
    @Req() req: RawBodyRequest<Request>,
    @Headers('svix-id') id: string | undefined,
    @Headers('svix-timestamp') timestamp: string | undefined,
    @Headers('svix-signature') signature: string | undefined,
  ): Promise<{ received: true }> {
    if (!this.verifier || !req.rawBody || !id || !timestamp || !signature) {
      throw new UnauthorizedException('Invalid webhook signature');
    }
    const payload = req.rawBody.toString('utf8');
    try {
      // svix 2.x `verify()` only checks the signature (it returns nothing); we parse below.
      this.verifier.verify(payload, {
        'svix-id': id,
        'svix-timestamp': timestamp,
        'svix-signature': signature,
      });
    } catch {
      this.logger.warn('Rejected a Resend webhook with an invalid signature');
      throw new UnauthorizedException('Invalid webhook signature');
    }

    let event: ResendEmailEvent;
    try {
      event = JSON.parse(payload) as ResendEmailEvent;
    } catch {
      throw new BadRequestException('Webhook body is not valid JSON');
    }

    try {
      await this.webhooks.apply(event);
    } catch (error) {
      // Verified but failed to apply: log and still acknowledge. A provider that keeps getting
      // 5xx disables the endpoint, and delivery status is informational, not money.
      this.logger.error(
        `Failed to apply Resend event ${event.type}`,
        error as Error,
      );
    }
    return { received: true };
  }
}
