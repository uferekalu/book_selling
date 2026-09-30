/** Retry policy for the email outbox (docs/ARCHITECTURE.md §11). */

export const MAX_ATTEMPTS = 8;

/** How long a worker may hold a claimed row before another worker may reclaim it. */
export const SEND_LEASE_MS = 2 * 60_000;

/** Final rows are kept this long for support and audit, then removed by a TTL index. */
export const RETENTION_MS = 180 * 24 * 60 * 60_000;

/**
 * Delay before the attempt after `attempt` failed: 30s, 2m, 8m, 32m, then capped at 6h, with up to
 * 20% random jitter so a provider outage doesn't end in a synchronised retry storm. The total
 * window (about a day) stays inside Resend's 24h idempotency-key lifetime, so a retry after an
 * ambiguous timeout can never deliver twice.
 */
export function retryDelayMs(
  attempt: number,
  random: () => number = Math.random,
): number {
  const base = Math.min(
    30_000 * 4 ** Math.max(0, attempt - 1),
    6 * 60 * 60_000,
  );
  return Math.round(base * (1 + 0.2 * random()));
}
