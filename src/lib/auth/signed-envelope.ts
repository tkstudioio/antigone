// Isomorphic (client + server) canonical form for a signed mutation. Both sides must build the
// EXACT same string, so the signature binds not just the payload but also the HTTP method, the
// request path, a timestamp, and a one-time nonce. This prevents:
//   - replaying a captured request (nonce is single-use, see replay-guard.ts);
//   - reusing a signature on a different endpoint with a same-shaped payload (path + method bound);
//   - replaying outside a short window (timestamp checked for freshness).
//
// Field order is fixed by this object literal; never reorder it.

/** Max age (ms) a signed request may have before it is rejected as stale. */
export const SIGNED_REQUEST_TTL_MS = 120_000;

/**
 * Tolerance (ms) for the client clock running AHEAD of the server. Future-dating beyond this is
 * rejected, so a signature is only ever "fresh" within roughly [ts, ts + TTL]. The replay nonce is
 * kept for TTL + this skew so its retention always covers the full freshness horizon (otherwise a
 * future-dated request could outlive its own nonce and be replayed).
 */
export const SIGNED_REQUEST_CLOCK_SKEW_MS = 5_000;

/** Body field names carrying the signature metadata alongside the domain payload. */
export const SIG_TS_FIELD = "_sigTs";
export const SIG_NONCE_FIELD = "_sigNonce";

export function canonicalSignedMessage(params: {
  method: string;
  path: string;
  ts: number;
  nonce: string;
  payload: Record<string, unknown>;
}): string {
  return JSON.stringify({
    method: params.method,
    path: params.path,
    ts: params.ts,
    nonce: params.nonce,
    payload: params.payload,
  });
}
