import { getModelToken } from '@nestjs/mongoose';
import type { Model } from 'mongoose';
import { Secret, TOTP } from 'otpauth';
import request from 'supertest';
import { User } from '../src/users/schemas/user.schema.js';
import { createTestApp, type TestApp } from './app.js';

const PASSWORD = 'lathe-gearbox-torque-42';

describe('Catalog (e2e)', () => {
  let ctx: TestApp;
  let users: Model<User>;
  let staffToken: string;
  let customerToken: string;
  let staffNoMfaToken: string;
  const http = () => request(ctx.app.getHttpServer());

  async function register(email: string): Promise<string> {
    const res = await http()
      .post('/auth/register')
      .send({
        name: 'Test Person',
        email,
        password: PASSWORD,
        acceptTerms: true,
      })
      .expect(201);
    return res.body.accessToken as string;
  }

  beforeAll(async () => {
    ctx = await createTestApp();
    users = ctx.app.get(getModelToken(User.name));

    customerToken = await register('customer@example.com');

    await register('admin@example.com');
    await users.updateOne({ email: 'admin@example.com' }, { role: 'admin' });
    const login = await http()
      .post('/auth/login')
      .send({ email: 'admin@example.com', password: PASSWORD })
      .expect(200);
    staffNoMfaToken = login.body.accessToken;
    const auth = { Authorization: `Bearer ${staffNoMfaToken}` };
    const setup = await http()
      .post('/auth/2fa/setup')
      .set(auth)
      .send({ password: PASSWORD })
      .expect(200);
    const code = TOTP.generate({
      secret: Secret.fromBase32(setup.body.manualKey.replace(/\s/g, '')),
      period: 30,
    });
    staffToken = (
      await http().post('/auth/2fa/enable').set(auth).send({ code }).expect(200)
    ).body.accessToken;
  });

  afterAll(async () => {
    await ctx?.close();
  });

  it('serves the public catalogue without signing in', async () => {
    const res = await http().get('/catalog/books?currency=NGN').expect(200);
    expect(res.body).toMatchObject({ items: [], total: 0, page: 1 });
    await http().get('/catalog/categories').expect(200, []);
    await http().get('/catalog/books/no-such-book').expect(404);
  });

  it('validates catalogue queries', async () => {
    await http().get('/catalog/books?currency=JPY').expect(400);
    await http().get('/catalog/books?sort=cheapest').expect(400);
    await http().get('/catalog/books?pageSize=1000').expect(400);
  });

  it('keeps the admin catalogue behind staff role AND two-step verification', async () => {
    await http().get('/admin/catalog/books').expect(401);
    await http()
      .get('/admin/catalog/books')
      .set('Authorization', `Bearer ${customerToken}`)
      .expect(403);
    // The admin's first token predates enabling 2FA, so it isn't mfa-verified.
    const noMfa = await http()
      .get('/admin/catalog/books')
      .set('Authorization', `Bearer ${staffNoMfaToken}`)
      .expect(403);
    expect(noMfa.body.code).toBe('two_factor_required');
    await http()
      .get('/admin/catalog/books')
      .set('Authorization', `Bearer ${staffToken}`)
      .expect(200);
  });

  it('runs the editor flow over HTTP: draft → details → prices → checklist', async () => {
    const auth = { Authorization: `Bearer ${staffToken}` };
    const author = await http()
      .post('/admin/catalog/authors')
      .set(auth)
      .send({ name: 'Prof. A. Author', title: 'Foundry lecturer' })
      .expect(201);
    const created = await http()
      .post('/admin/catalog/books')
      .set(auth)
      .send({ title: 'Principles of Foundry Technology' })
      .expect(201);
    expect(created.body).toMatchObject({
      slug: 'principles-of-foundry-technology',
      status: 'draft',
      manuscript: null,
    });

    const id = created.body.id as string;
    await http()
      .patch(`/admin/catalog/books/${id}`)
      .set(auth)
      .send({
        authorIds: [author.body.id],
        abstractMarkdown: 'Moulding, melting and pouring sound castings.',
      })
      .expect(200);

    // Prices are integer minor units: a float is rejected outright.
    await http()
      .put(`/admin/catalog/books/${id}/formats`)
      .set(auth)
      .send({
        formats: [
          {
            type: 'ebook',
            active: true,
            prices: [{ currency: 'USD', amount: 24.99 }],
          },
        ],
      })
      .expect(400);
    const priced = await http()
      .put(`/admin/catalog/books/${id}/formats`)
      .set(auth)
      .send({
        formats: [
          {
            type: 'ebook',
            active: true,
            prices: [{ currency: 'USD', amount: 2499 }],
          },
        ],
      })
      .expect(200);
    expect(priced.body.formats[0].sku).toMatch(/^BK-[0-9A-F]{6}-E$/);

    const publish = await http()
      .post(`/admin/catalog/books/${id}/publish`)
      .set(auth)
      .expect(400);
    expect(publish.body.code).toBe('not_ready');
    expect(publish.body.problems).toEqual(
      expect.arrayContaining([
        'Upload a cover image',
        'Ebook: set a price in NGN, GBP, EUR',
        expect.stringMatching(/abstract/),
      ]),
    );

    // Drafts never appear in the store.
    expect((await http().get('/catalog/books').expect(200)).body.total).toBe(0);
  });

  it('serves previews publicly and keeps preview admin behind staff 2FA', async () => {
    await http().get('/catalog/books/no-such-book/preview').expect(404);
    await http().get('/catalog/previews/64b000000000000000000009').expect(404);
    await http().get('/catalog/previews/not-an-id').expect(404);
    // Analytics: strict validation, 204 for a well-formed batch (even for an unknown book).
    await http()
      .post('/catalog/preview-events')
      .send({ slug: 'x', sessionId: 'short', events: [{ type: 'open' }] })
      .expect(400);
    await http()
      .post('/catalog/preview-events')
      .send({
        slug: 'no-such-book',
        sessionId: 'abcdefgh1234',
        events: [{ type: 'hack' }],
      })
      .expect(400);
    await http()
      .post('/catalog/preview-events')
      .send({
        slug: 'no-such-book',
        sessionId: 'abcdefgh1234',
        events: [{ type: 'open' }, { type: 'page', page: 2 }],
      })
      .expect(204);

    const book = await http()
      .post('/admin/catalog/books')
      .set('Authorization', `Bearer ${staffToken}`)
      .send({ title: 'Heat Treatment of Steels' })
      .expect(201);
    expect(book.body.preview).toMatchObject({
      enabled: false,
      status: 'none',
      sections: [],
      maxPercent: 15,
      maxPages: null,
    });
    const route = `/admin/catalog/books/${book.body.id}/preview`;
    const body = { sections: [{ label: 'Intro', fromPage: 1, toPage: 2 }] };
    await http().put(route).send(body).expect(401);
    await http()
      .put(route)
      .set('Authorization', `Bearer ${staffNoMfaToken}`)
      .send(body)
      .expect(403);
    const noFile = await http()
      .put(route)
      .set('Authorization', `Bearer ${staffToken}`)
      .send(body)
      .expect(400);
    expect(noFile.body.message).toMatch(/Upload the book PDF first/);
  });

  it('previews Markdown through the storefront sanitizer, for staff only', async () => {
    const markdown =
      '## Sand moulding\n\n**Green sand** <script>alert(1)</script> [x](javascript:alert(1))';
    await http()
      .post('/admin/catalog/markdown-preview')
      .set('Authorization', `Bearer ${customerToken}`)
      .send({ markdown })
      .expect(403);
    const res = await http()
      .post('/admin/catalog/markdown-preview')
      .set('Authorization', `Bearer ${staffToken}`)
      .send({ markdown })
      .expect(200);
    expect(res.body.html).toContain('<h2>Sand moulding</h2>');
    expect(res.body.html).toContain('<strong>Green sand</strong>');
    expect(res.body.html).not.toMatch(/<script|javascript:/i);
  });

  it('reports uploads as unavailable (503) when Cloudinary is not configured', async () => {
    const auth = { Authorization: `Bearer ${staffToken}` };
    const book = await http()
      .post('/admin/catalog/books')
      .set(auth)
      .send({ title: 'Heat Treatment of Steels' })
      .expect(201);
    await http()
      .post('/uploads/signature')
      .set(auth)
      .send({ kind: 'cover', ownerId: book.body.id })
      .expect(503);
    await http()
      .post('/uploads/signature')
      .set(auth)
      .send({ kind: 'cover', ownerId: '64b0000000000000000000ff' })
      .expect(404);
    await http()
      .post('/uploads/signature')
      .set(auth)
      .send({ kind: 'virus', ownerId: book.body.id })
      .expect(400);
    await http()
      .post('/uploads/signature')
      .set('Authorization', `Bearer ${customerToken}`)
      .send({ kind: 'cover', ownerId: book.body.id })
      .expect(403);
  });
});
