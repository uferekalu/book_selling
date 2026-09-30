import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { render } from '@react-email/render';
import {
  EMAIL_TEMPLATES,
  isTemplateName,
  type TemplateDefinition,
} from './templates/registry.js';
import type { EmailBrand } from './templates/theme.js';

export interface RenderedEmail {
  subject: string;
  html: string;
  text: string;
}

/** Turns a template name + data into subject, HTML and plain text. */
@Injectable()
export class TemplateRendererService {
  readonly brand: EmailBrand;

  constructor(config: ConfigService) {
    this.brand = {
      name: config.get<string>('BRAND_NAME') ?? 'Engineering Books',
      siteUrl: config.getOrThrow<string>('FRONTEND_URL'),
      supportEmail: config.get<string>('SUPPORT_EMAIL'),
      postalAddress: config.get<string>('BUSINESS_POSTAL_ADDRESS'),
    };
  }

  async render(template: string, data: unknown): Promise<RenderedEmail> {
    if (!isTemplateName(template))
      throw new Error(`Unknown email template "${template}"`);
    if (data === null || typeof data !== 'object') {
      throw new Error(
        `Email template "${template}" needs data, got ${String(data)}`,
      );
    }
    const definition = EMAIL_TEMPLATES[template] as TemplateDefinition<unknown>;
    const element = definition.render(data, this.brand);
    const [html, text] = await Promise.all([
      render(element),
      render(element, { plainText: true }),
    ]);
    return { subject: definition.subject(data, this.brand), html, text };
  }
}
