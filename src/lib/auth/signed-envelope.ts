import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex } from "@noble/hashes/utils.js";

// Isomorphic (client + server) canonical form for a signed mutation (envelope v2). Both sides must
// build the EXACT same string, so the signature binds the HTTP method, the request path (pathname +
// query string), a timestamp, a one-time nonce, and the SHA-256 of the raw request body. This
// prevents:
//   - tampering with the body (any changed byte changes `bodySha256`);
//   - replaying a captured request (nonce is single-use, enforced by the unique `signed_action.nonce`);
//   - reusing a signature on a different endpoint or query string (method + path bound);
//   - replaying outside a short window (timestamp checked for freshness).
//
// The signature, timestamp and nonce travel in request headers; the body is sent untouched.
// Field order is fixed by the object literal below; never reorder it.

export const SIGNED_ENVELOPE_VERSION = 2;

/** Max age (ms) a signed request may have before it is rejected as stale. */
export const SIGNED_REQUEST_TTL_MS = 120_000;

/** Tolerance (ms) for the client clock running AHEAD of the server. */
export const SIGNED_REQUEST_CLOCK_SKEW_MS = 5_000;

/** Request headers carrying the signature metadata. */
export const SIGNATURE_HEADER = "x-antigone-signature";
export const TIMESTAMP_HEADER = "x-antigone-timestamp";
export const NONCE_HEADER = "x-antigone-nonce";

/** Hex SHA-256 of the raw request body bytes (empty body hashes the empty string). */
export function bodySha256Hex(body: Uint8Array): string {
  return bytesToHex(sha256(body));
}

export function canonicalSignedMessage(params: {
  method: string;
  /** Pathname + search, exactly as sent (e.g. `/api/chat/1/attachment?name=a.png`). */
  path: string;
  ts: number;
  nonce: string;
  bodySha256: string;
}): string {
  return JSON.stringify({
    v: SIGNED_ENVELOPE_VERSION,
    method: params.method,
    path: params.path,
    ts: params.ts,
    nonce: params.nonce,
    bodySha256: params.bodySha256,
  });
}
