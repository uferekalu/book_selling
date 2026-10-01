import { randomBytes } from 'node:crypto';
import { SecretBox } from './secret-box.js';
import { hashToken, randomToken, safeEqual } from './tokens.js';

describe('tokens', () => {
  it('generates unique URL-safe tokens with 256 bits of entropy', () => {
    const a = randomToken();
    const b = randomToken();
    expect(a).not.toBe(b);
    expect(a).toMatch(/^[A-Za-z0-9_-]{43}$/);
  });

  it('hashes deterministically and differently per token', () => {
    expect(hashToken('abc')).toBe(hashToken('abc'));
    expect(hashToken('abc')).not.toBe(hashToken('abd'));
    expect(hashToken('abc')).toHaveLength(64);
  });

  it('compares safely', () => {
    expect(safeEqual('123456', '123456')).toBe(true);
    expect(safeEqual('123456', '123457')).toBe(false);
    expect(safeEqual('123', '123456')).toBe(false);
  });
});

describe('SecretBox', () => {
  const box = new SecretBox(randomBytes(32).toString('base64'));

  it('round-trips a secret', () => {
    expect(box.open(box.seal('JBSWY3DPEHPK3PXP'))).toBe('JBSWY3DPEHPK3PXP');
  });

  it('produces different ciphertext each time (random IV)', () => {
    expect(box.seal('same')).not.toBe(box.seal('same'));
  });

  it('rejects tampered ciphertext', () => {
    const sealed = box.seal('secret').split('.');
    sealed[3] = Buffer.from('tampered').toString('base64url');
    expect(() => box.open(sealed.join('.'))).toThrow();
  });

  it('rejects a secret sealed with another key', () => {
    const other = new SecretBox(randomBytes(32).toString('base64'));
    expect(() => box.open(other.seal('secret'))).toThrow();
  });

  it('refuses a key of the wrong length', () => {
    expect(() => new SecretBox(randomBytes(16).toString('base64'))).toThrow(
      /32 bytes/,
    );
  });
});
