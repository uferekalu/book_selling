import { MAX_ATTEMPTS, retryDelayMs } from './retry-policy.js';

describe('retryDelayMs', () => {
  const noJitter = () => 0;

  it('backs off exponentially from 30 seconds', () => {
    expect(retryDelayMs(1, noJitter)).toBe(30_000);
    expect(retryDelayMs(2, noJitter)).toBe(120_000);
    expect(retryDelayMs(3, noJitter)).toBe(480_000);
    expect(retryDelayMs(4, noJitter)).toBe(1_920_000);
  });

  it('caps at six hours', () => {
    expect(retryDelayMs(7, noJitter)).toBe(6 * 60 * 60_000);
  });

  it('adds at most 20% jitter', () => {
    expect(retryDelayMs(1, () => 0.999)).toBeLessThanOrEqual(36_000);
    expect(retryDelayMs(1, () => 0.5)).toBe(33_000);
  });

  it('keeps the whole retry window inside the provider 24h idempotency window', () => {
    let total = 0;
    for (let attempt = 1; attempt < MAX_ATTEMPTS; attempt += 1) {
      total += retryDelayMs(attempt, () => 1);
    }
    expect(total).toBeLessThan(24 * 60 * 60_000);
  });
});
