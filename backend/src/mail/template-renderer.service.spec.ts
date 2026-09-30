import { ConfigService } from '@nestjs/config';
import { EMAIL_TEMPLATES, type TemplateName } from './templates/registry.js';
import { TemplateRendererService } from './template-renderer.service.js';

const renderer = new TemplateRendererService(
  new ConfigService({
    FRONTEND_URL: 'https://books.example.com',
    BRAND_NAME: 'Engineering Books',
    SUPPORT_EMAIL: 'help@books.example.com',
    BUSINESS_POSTAL_ADDRESS: '12 Campus Road, Lagos',
  }),
);

const names = Object.keys(EMAIL_TEMPLATES) as TemplateName[];

describe('TemplateRendererService', () => {
  it.each(names)(
    'renders %s as HTML and plain text from its sample',
    async (name) => {
      const { subject, html, text } = await renderer.render(
        name,
        EMAIL_TEMPLATES[name].sample,
      );
      expect(subject.length).toBeGreaterThan(5);
      expect(html).toContain('<html');
      expect(html).toContain('lang="en"');
      expect(html).toContain('Engineering Books');
      expect(html).toContain('12 Campus Road, Lagos');
      expect(text.length).toBeGreaterThan(50);
      // A missing field renders as the literal "undefined"/"null"; never ship that to a customer.
      expect(`${subject}${html}${text}`).not.toMatch(
        /\bundefined\b|\bnull\b|NaN|\[object Object\]/,
      );
    },
  );

  it('puts every link in the plain-text version too', async () => {
    const data = EMAIL_TEMPLATES['auth.password-reset'].sample;
    const { html, text } = await renderer.render('auth.password-reset', data);
    expect(html).toContain(data.resetUrl);
    expect(text).toContain(data.resetUrl);
  });

  it('escapes user-controlled text', async () => {
    const { html } = await renderer.render('auth.verify-email', {
      ...EMAIL_TEMPLATES['auth.verify-email'].sample,
      name: '<script>alert(1)</script>',
    });
    expect(html).not.toContain('<script>alert(1)</script>');
    expect(html).toContain('&lt;script&gt;');
  });

  it('builds the subject from data', async () => {
    const { subject } = await renderer.render('auth.security-notice', {
      ...EMAIL_TEMPLATES['auth.security-notice'].sample,
      event: 'password_changed',
    });
    expect(subject).toBe('Your password was changed');
  });

  it('rejects unknown templates and missing data', async () => {
    await expect(renderer.render('nope', {})).rejects.toThrow(
      /Unknown email template/,
    );
    await expect(renderer.render('auth.welcome', null)).rejects.toThrow(
      /needs data/,
    );
  });

  it('marks every template that carries a one-time link as sensitive', () => {
    for (const name of names) {
      const sample = JSON.stringify(EMAIL_TEMPLATES[name].sample);
      if (sample.includes('token='))
        expect(EMAIL_TEMPLATES[name].sensitive, name).toBe(true);
    }
  });
});
