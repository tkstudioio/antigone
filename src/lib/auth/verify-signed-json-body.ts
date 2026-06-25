import { schnorr } from "@noble/curves/secp256k1.js";
import { hex } from "@scure/base";
import { z } from "zod";
import { toXOnly } from "@/lib/utils";
import {
  canonicalSignedMessage,
  SIG_NONCE_FIELD,
  SIG_TS_FIELD,
  SIGNED_REQUEST_CLOCK_SKEW_MS,
  SIGNED_REQUEST_TTL_MS,
} from "@/lib/auth/signed-envelope";
import { consumeNonce } from "@/lib/auth/replay-guard";

const envelopeSchema = z.object({
  signature: z.string().min(1),
  [SIG_TS_FIELD]: z.number().int(),
  [SIG_NONCE_FIELD]: z.string().min(1),
});

/**
 * Verify a signed mutation body.
 *
 * The signature binds method + path + timestamp + nonce + payload (see signed-envelope.ts). We
 * reconstruct that exact message from the request itself (method, pathname) plus the timestamp and
 * nonce carried in the body, then verify freshness (anti-stale), single-use (anti-replay), and the
 * Schnorr signature against `pubkey`.
 */
export async function verifySignedJsonBody<TSchema extends z.ZodObject<z.ZodRawShape>>(
  request: Request,
  pubkey: string,
  schema: TSchema
): Promise<z.infer<TSchema>> {
  const body = (await request.json()) as Record<string, unknown>;

  const envelope = envelopeSchema.parse(body);
  const signature = envelope.signature;
  const ts = envelope[SIG_TS_FIELD];
  const nonce = envelope[SIG_NONCE_FIELD];

  // Freshness: reject stale requests (older than TTL) and requests future-dated beyond a small
  // clock skew. Bounding the future side keeps the effective validity window ~[ts, ts + TTL]
  // instead of ±TTL, so it never outlives the replay nonce's retention (see consumeNonce below).
  const age = Date.now() - ts;
  if (age > SIGNED_REQUEST_TTL_MS || age < -SIGNED_REQUEST_CLOCK_SKEW_MS) {
    throw new Error("Request timestamp out of range");
  }

  // Reconstruct the payload exactly as the client signed it: the raw body minus the envelope
  // metadata. Destructuring a JSON-parsed object preserves the client's key insertion order, so
  // the re-serialized payload is byte-identical to the client's.
  /* eslint-disable @typescript-eslint/no-unused-vars */
  const { signature: _sig, [SIG_TS_FIELD]: _ts, [SIG_NONCE_FIELD]: _nonce, ...payload } = body;
  /* eslint-enable @typescript-eslint/no-unused-vars */

  const method = request.method.toUpperCase();
  const path = new URL(request.url).pathname;
  const message = new TextEncoder().encode(
    canonicalSignedMessage({ method, path, ts, nonce, payload })
  );

  const isValid = schnorr.verify(hex.decode(signature), message, toXOnly(hex.decode(pubkey)));
  if (!isValid) {
    throw new Error("Invalid signature");
  }

  // Burn the nonce only AFTER a valid signature, so an attacker cannot grief by pre-consuming
  // nonces. Retain it for TTL + skew so the retention covers the full freshness horizon (a request
  // first seen as early as ts - skew must keep its nonce until ts + TTL).
  if (!consumeNonce(nonce, SIGNED_REQUEST_TTL_MS + SIGNED_REQUEST_CLOCK_SKEW_MS)) {
    throw new Error("Replay detected");
  }

  // Validate the domain payload (envelope metadata fields are stripped by the schema).
  return schema.parse(body);
}
