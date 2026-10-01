import { getModelToken } from '@nestjs/mongoose';
import type { Model } from 'mongoose';
import { Secret, TOTP } from 'otpauth';
import request from 'supertest';
import { User } from '../src/users/schemas/user.schema.js';
import { createTestApp, type TestApp } from './app.js';

const PASSWORD = 'lathe-gearbox-torque-42';

/** Extracts `bs_rt=...` from Set-Cookie for replaying as a Cookie header. */
function refreshCookie(res: request.Response): string {
  const header = ([] as string[])
    .concat(res.headers['set-cookie'] ?? [])
    .find((c) => c.startsWith('bs_rt='));
  if (!header) throw new Error('no refresh cookie set');
  return header.split(';')[0];
}

describe('Auth (e2e)', () => {
  let ctx: TestApp;
  let users: Model<User>;
  const http = () => request(ctx.app.getHttpServer());

  beforeAll(async () => {
    ctx = await createTestApp();
    users = ctx.app.get(getModelToken(User.name));
  });

  afterAll(async () => {
    await ctx?.close();
  });

  it('register → me → refresh (cookie) → logout, with hardened cookie attributes', async () => {
    const reg = await http()
      .post('/auth/register')
      .send({
        name: 'Ada Okafor',
        email: 'ada@example.com',
        password: PASSWORD,
        acceptTerms: true,
      })
      .expect(201);
    expect(reg.body).toMatchObject({
      status: 'authenticated',
      user: { email: 'ada@example.com' },
    });
    expect(reg.body.user.passwordHash).toBeUndefined();

    const setCookie = ([] as string[])
      .concat(reg.headers['set-cookie'])
      .find((c) => c.startsWith('bs_rt='))!;
    expect(setCookie).toMatch(/HttpOnly/i);
    expect(setCookie).toMatch(/SameSite=Strict/i);
    expect(setCookie).toMatch(/Path=\/api\/auth/);

    await http()
      .get('/auth/me')
      .set('Authorization', `Bearer ${reg.body.accessToken}`)
      .expect(200);

    const refreshed = await http()
      .post('/auth/refresh')
      .set('Cookie', refreshCookie(reg))
      .expect(200);
    expect(refreshed.body.accessToken).toBeTruthy();

    await http()
      .post('/auth/logout')
      .set('Cookie', refreshCookie(refreshed))
      .expect(204);
    await http()
      .post('/auth/refresh')
      .set('Cookie', refreshCookie(refreshed))
      .expect(401);
  });

  it('is default-deny: protected routes need a valid access token', async () => {
    await http().get('/auth/me').expect(401);
    await http()
      .get('/users/me/addresses')
      .set('Authorization', 'Bearer not-a-jwt')
      .expect(401);
    // No cookie at all is simply "not signed in"; a bad cookie is rejected.
    await http().post('/auth/refresh').expect(200, { status: 'anonymous' });
    await http().post('/auth/refresh').set('Cookie', 'bs_rt=forged').expect(401);
    // Public routes stay open.
    await http().get('/health').expect(200);
  });

  it('validates input strictly', async () => {
    const unknownField = await http()
      .post('/auth/login')
      .send({ email: 'ada@example.com', password: PASSWORD, isAdmin: true })
      .expect(400);
    expect(JSON.stringify(unknownField.body.message)).toMatch(
      /isAdmin should not exist/,
    );

    await http()
      .post('/auth/register')
      .send({
        name: 'Bob',
        email: 'bob@example.com',
        password: PASSWORD,
        acceptTerms: false,
      })
      .expect(400);
  });

  it('manages addresses for the signed-in user only', async () => {
    const login = await http()
      .post('/auth/login')
      .send({ email: 'ada@example.com', password: PASSWORD })
      .expect(200);
    const auth = { Authorization: `Bearer ${login.body.accessToken}` };
    const created = await http()
      .post('/users/me/addresses')
      .set(auth)
      .send({
        fullName: 'Ada Okafor',
        phone: '+2348012345678',
        line1: '12 Campus Road',
        city: 'Lagos',
        country: 'ng',
      })
      .expect(201);
    expect(created.body).toEqual([
      expect.objectContaining({ country: 'NG', isDefault: true }),
    ]);
    await http()
      .delete(`/users/me/addresses/${created.body[0].id}`)
      .set(auth)
      .expect(200, []);
    await http().delete('/users/me/addresses/not-an-id').set(auth).expect(404);
  });

  it('staff routes need the right role AND a two-step-verified session', async () => {
    const owner = await http()
      .post('/auth/register')
      .send({
        name: 'The Lecturer',
        email: 'owner@example.com',
        password: PASSWORD,
        acceptTerms: true,
      })
      .expect(201);
    const target = await http()
      .post('/auth/register')
      .send({
        name: 'Helper Person',
        email: 'helper@example.com',
        password: PASSWORD,
        acceptTerms: true,
      })
      .expect(201);
    const targetId = target.body.user.id as string;

    // A customer can't change roles.
    await http()
      .patch(`/users/${targetId}/role`)
      .set('Authorization', `Bearer ${target.body.accessToken}`)
      .send({ role: 'admin' })
      .expect(403);

    await users.updateOne({ email: 'owner@example.com' }, { role: 'owner' });
    const ownerLogin = await http()
      .post('/auth/login')
      .send({ email: 'owner@example.com', password: PASSWORD })
      .expect(200);
    const noMfa = await http()
      .patch(`/users/${targetId}/role`)
      .set('Authorization', `Bearer ${ownerLogin.body.accessToken}`)
      .send({ role: 'admin' })
      .expect(403);
    expect(noMfa.body.code).toBe('two_factor_required');

    // Enrol in two-step verification; the returned token is mfa-verified.
    const auth = { Authorization: `Bearer ${ownerLogin.body.accessToken}` };
    const setup = await http()
      .post('/auth/2fa/setup')
      .set(auth)
      .send({ password: PASSWORD })
      .expect(200);
    expect(setup.body.qrCodeSvg).toContain('<svg');
    const code = TOTP.generate({
      secret: Secret.fromBase32(setup.body.manualKey.replace(/\s/g, '')),
      period: 30,
    });
    const enabled = await http()
      .post('/auth/2fa/enable')
      .set(auth)
      .send({ code })
      .expect(200);
    expect(enabled.body.recoveryCodes).toHaveLength(10);

    const changed = await http()
      .patch(`/users/${targetId}/role`)
      .set('Authorization', `Bearer ${enabled.body.accessToken}`)
      .send({ role: 'admin' })
      .expect(200);
    expect(changed.body.role).toBe('admin');

    // The owner role can't be granted through the API.
    await http()
      .patch(`/users/${targetId}/role`)
      .set('Authorization', `Bearer ${enabled.body.accessToken}`)
      .send({ role: 'owner' })
      .expect(400);

    // The promoted user's old sessions ended, so the new role applies on next sign-in.
    await http()
      .post('/auth/refresh')
      .set('Cookie', refreshCookie(target))
      .expect(401);
    expect(owner.body.user.role).toBe('customer');
  });

  it('never reveals whether an email exists on forgot-password', async () => {
    const known = await http()
      .post('/auth/forgot-password')
      .send({ email: 'ada@example.com' })
      .expect(202);
    const unknown = await http()
      .post('/auth/forgot-password')
      .send({ email: 'nobody@example.com' })
      .expect(202);
    expect(known.body).toEqual(unknown.body);
  });
});
