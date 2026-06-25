"use client";

import { signMessage } from "@/lib/auth/signature";
import { canonicalSignedMessage, SIG_NONCE_FIELD, SIG_TS_FIELD } from "@/lib/auth/signed-envelope";

function freshNonce(): string {
  // Browser + modern Node both expose crypto.randomUUID.
  return crypto.randomUUID();
}

/**
 * Generic signed JSON request. Accepts any HTTP method ("POST" | "PATCH" | "DELETE").
 * The body is always sent as JSON (including for DELETE, to carry the signature).
 *
 * The signature covers method + full path + timestamp + nonce + payload (see signed-envelope.ts),
 * so a captured request cannot be replayed or reused on another endpoint. The timestamp and nonce
 * are sent alongside the payload so the server can reconstruct the exact signed message.
 */
export async function requestSigned<TResponse>(
  method: "POST" | "PATCH" | "DELETE",
  path: string,
  payload: Record<string, unknown>,
  privateKey: string
): Promise<TResponse> {
  const fullPath = `/api${path}`;
  const ts = Date.now();
  const nonce = freshNonce();

  const message = canonicalSignedMessage({ method, path: fullPath, ts, nonce, payload });
  const signature = signMessage(message, privateKey);

  const response = await fetch(fullPath, {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      ...payload,
      signature,
      [SIG_TS_FIELD]: ts,
      [SIG_NONCE_FIELD]: nonce,
    }),
  });
  if (!response.ok) {
    const error = (await response.json().catch(() => ({}))) as {
      error?: string;
    };
    throw new Error(error.error ?? `Request failed (${response.status})`);
  }
  return (await response.json()) as TResponse;
}

/** Thin wrapper around requestSigned for backwards compatibility. */
export async function postSigned<TResponse>(
  path: string,
  payload: Record<string, unknown>,
  privateKey: string
): Promise<TResponse> {
  return requestSigned<TResponse>("POST", path, payload, privateKey);
}
