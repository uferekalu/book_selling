/**
 * Renders every email template with its sample data into .email-previews/ (gitignored): one
 * .html and one .txt per template, plus an index page. Open index.html in a browser to review
 * the exact output customers receive, including at phone width.
 *
 *   npm run email:preview
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { ConfigService } from '@nestjs/config';
import { TemplateRendererService } from '../src/mail/template-renderer.service.js';
import {
  EMAIL_TEMPLATES,
  type TemplateName,
} from '../src/mail/templates/registry.js';

const OUT = join(process.cwd(), '.email-previews');
mkdirSync(OUT, { recursive: true });

const renderer = new TemplateRendererService(
  new ConfigService({
    FRONTEND_URL: process.env.FRONTEND_URL ?? 'http://localhost:3000',
    BRAND_NAME: process.env.BRAND_NAME ?? 'Engineering Books',
    SUPPORT_EMAIL: process.env.SUPPORT_EMAIL ?? 'support@example.com',
    BUSINESS_POSTAL_ADDRESS:
      process.env.BUSINESS_POSTAL_ADDRESS ?? '12 Campus Road, Lagos, Nigeria',
  }),
);

const links: string[] = [];
for (const name of Object.keys(EMAIL_TEMPLATES) as TemplateName[]) {
  const { subject, html, text } = await renderer.render(
    name,
    EMAIL_TEMPLATES[name].sample,
  );
  writeFileSync(join(OUT, `${name}.html`), html);
  writeFileSync(join(OUT, `${name}.txt`), `Subject: ${subject}\n\n${text}`);
  links.push(
    `<li><a href="${name}.html">${name}</a> (<a href="${name}.txt">text</a>): ${subject.replace(/</g, '&lt;')}</li>`,
  );
}

writeFileSync(
  join(OUT, 'index.html'),
  `<!doctype html><meta charset="utf-8"><title>Email previews</title><body style="font-family:system-ui;padding:24px"><h1>Email previews</h1><ul>${links.join('')}</ul></body>`,
);
console.log(`Rendered ${links.length} templates to ${OUT}`);
