import { schnorr } from "@noble/curves/secp256k1.js";
import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex } from "@noble/hashes/utils.js";
import { hex } from "@scure/base";
import type { z } from "zod";
import { bodySha256Hex, canonicalSignedMessage } from "@/lib/auth/signed-envelope";

/**
 * Isomorphic verifier for persisted signed actions (the `SignedAction` evidence rows).
 *
 * NO server-only import: the browser uses it to check that a record the server returned was really
 * written by the person it is attributed to, and the server can reuse it in tests or tooling.
 *
 * A record is accepted only when ALL of these hold:
 *   1. its author is one of the EXPECTED pubkeys (never "whoever the record claims to be");
 *   2. its method and path match the EXPECTED endpoint (a signature for another endpoint is useless);
 *   3. the stored body hashes to the signed `bodySha256`;
 *   4. the Schnorr signature over the rebuilt envelope v2 verifies against the author's key.
 * The caller then reads values from the returned PARSED BODY — never from parallel server fields.
 */

/** A persisted signed request, as returned by the API (`signed_action` row, `ts` as a number). */
export type SignedActionRecord = {
  id: number;
  /** Signer, 33-byte compressed hex. */
  pubkey: string;
  method: string;
  /** Pathname + query string, exactly as signed (e.g. `/api/orders/12/confirm`). */
  path: string;
  ts: number;
  nonce: string;
  bodySha256: string;
  /** Raw JSON body text; null for raw binary bodies (only the hash is kept). */
  body: string | null;
  signature: string;
};

export type PathExpectation = string | RegExp;

export type ExpectedAction = {
  /** Allowed author(s), 33-byte compressed hex (case-insensitive). */
  pubkey: string | readonly string[];
  /** Defaults to `POST`. */
  method?: string;
  /** Exact `pathname + search`, or a pattern for it. */
  path: PathExpectation;
};

export type VerifyFailureReason =
  | "missing-action"
  | "wrong-author"
  | "wrong-method"
  | "wrong-path"
  | "missing-body"
  | "body-hash-mismatch"
  | "bad-signature"
  | "invalid-body";

export type VerifyResult<T> =
  | { ok: true; body: T; action: SignedActionRecord }
  | { ok: false; reason: VerifyFailureReason; message: string };

const FAILURE_MESSAGES: Record<VerifyFailureReason, string> = {
  "missing-action": "No signed action is attached to this record",
  "wrong-author": "The record was signed by an unexpected key",
  "wrong-method": "The signature was made for a different HTTP method",
  "wrong-path": "The signature was made for a different endpoint",
  "missing-body": "The signed body is missing",
  "body-hash-mismatch": "The body does not match the signed hash",
  "bad-signature": "The signature is not valid",
  "invalid-body": "The signed body is malformed",
};

function fail(reason: VerifyFailureReason): {
  ok: false;
  reason: VerifyFailureReason;
  message: string;
} {
  return { ok: false, reason, message: FAILURE_MESSAGES[reason] };
}

/** Case-insensitive pubkey equality (hex). */
export function samePubkey(a: string | null | undefined, b: string | null | undefined): boolean {
  return a != null && b != null && a.toLowerCase() === b.toLowerCase();
}

function xOnly(compressedHex: string): Uint8Array {
  const bytes = hex.decode(compressedHex.toLowerCase());
  return bytes.length === 33 ? bytes.slice(1) : bytes;
}

function pathMatches(path: string, expected: PathExpectation): boolean {
  return typeof expected === "string" ? path === expected : expected.test(path);
}

/**
 * Verify a signed action against the EXPECTED author / method / path. Returns the parsed body
 * (validated with `schema` when given) or a typed failure. Never throws.
 */
export function verifySignedAction(
  record: SignedActionRecord | null | undefined,
  expected: ExpectedAction
): VerifyResult<unknown>;
export function verifySignedAction<T>(
  record: SignedActionRecord | null | undefined,
  expected: ExpectedAction,
  schema: z.ZodType<T>
): VerifyResult<T>;
export function verifySignedAction(
  record: SignedActionRecord | null | undefined,
  expected: ExpectedAction,
  schema?: z.ZodType<unknown>
): VerifyResult<unknown> {
  if (!record) return fail("missing-action");

  const allowed = typeof expected.pubkey === "string" ? [expected.pubkey] : expected.pubkey;
  if (!allowed.some((p) => samePubkey(p, record.pubkey))) return fail("wrong-author");

  if (record.method.toUpperCase() !== (expected.method ?? "POST").toUpperCase()) {
    return fail("wrong-method");
  }
  if (!pathMatches(record.path, expected.path)) return fail("wrong-path");

  if (record.body == null) return fail("missing-body");
  const bodyBytes = new TextEncoder().encode(record.body);
  if (bodySha256Hex(bodyBytes) !== record.bodySha256.toLowerCase()) {
    return fail("body-hash-mismatch");
  }

  let valid = false;
  try {
    const message = new TextEncoder().encode(
      canonicalSignedMessage({
        method: record.method.toUpperCase(),
        path: record.path,
        ts: record.ts,
        nonce: record.nonce,
        bodySha256: record.bodySha256.toLowerCase(),
      })
    );
    valid = schnorr.verify(hex.decode(record.signature), message, xOnly(record.pubkey));
  } catch {
    valid = false;
  }
  if (!valid) return fail("bad-signature");

  let parsed: unknown;
  try {
    parsed = JSON.parse(record.body);
  } catch {
    return fail("invalid-body");
  }
  if (schema) {
    const result = schema.safeParse(parsed);
    if (!result.success) return fail("invalid-body");
    parsed = result.data;
  }
  return { ok: true, body: parsed, action: record };
}

/**
 * Stable identifier of a signed action, used to chain chat messages: SHA-256 (hex) over the
 * canonical envelope the author signed plus the signature itself. Only the author can produce a
 * record with a given hash, so a server cannot mint or alter a link in the chain.
 */
export function signedActionHash(
  record: Pick<SignedActionRecord, "method" | "path" | "ts" | "nonce" | "bodySha256" | "signature">
): string {
  const envelope = canonicalSignedMessage({
    method: record.method.toUpperCase(),
    path: record.path,
    ts: record.ts,
    nonce: record.nonce,
    bodySha256: record.bodySha256.toLowerCase(),
  });
  return bytesToHex(sha256(new TextEncoder().encode(`${envelope}\n${record.signature}`)));
}
