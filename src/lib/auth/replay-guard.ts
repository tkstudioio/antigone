// Anti-replay store for signed mutations. A signed request carries a one-time nonce; the first
// time we see it we record it until it expires, and any later request reusing the same nonce is
// rejected. This closes the replay vector left open when signatures only covered the JSON payload.
//
// In-memory only — same caveat as `rate-limit.ts`: it does not survive a restart and is not shared
// across instances. That is acceptable because the freshness window (see verify-signed-json-body)
// bounds how long a replay would be viable anyway, and a restart only shrinks the protection to
// that window.
type Seen = { expiresAt: number };

const globalForReplay = globalThis as unknown as {
  signedNonceStore?: Map<string, Seen>;
};

const store = globalForReplay.signedNonceStore ?? new Map<string, Seen>();
globalForReplay.signedNonceStore = store;

const SWEEP_THRESHOLD = 5000;

function sweep(now: number) {
  for (const [nonce, seen] of store) {
    if (seen.expiresAt <= now) store.delete(nonce);
  }
}

/**
 * Record a nonce and report whether it was fresh.
 * @returns `true` if the nonce had not been seen (request may proceed), `false` if it is a replay.
 */
export function consumeNonce(nonce: string, ttlMs: number): boolean {
  const now = Date.now();
  if (store.size > SWEEP_THRESHOLD) sweep(now);

  const existing = store.get(nonce);
  if (existing && existing.expiresAt > now) return false;

  store.set(nonce, { expiresAt: now + ttlMs });
  return true;
}
