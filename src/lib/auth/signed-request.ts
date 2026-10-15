"use client";

import { signMessage } from "@/lib/auth/signature";
import {
  bodySha256Hex,
  canonicalSignedMessage,
  NONCE_HEADER,
  SIGNATURE_HEADER,
  TIMESTAMP_HEADER,
} from "@/lib/auth/signed-envelope";

type SignedMethod = "POST" | "PUT" | "PATCH" | "DELETE";

function freshNonce(): string {
  // Browser + modern Node both expose crypto.randomUUID.
  return crypto.randomUUID();
}

/**
 * Normalise `/api${path}` through the URL parser so the signed string (pathname + search) is the
 * exact one the server rebuilds from `request.url`.
 */
function toSignedPath(path: string): string {
  const url = new URL(`/api${path}`, "http://localhost");
  return `${url.pathname}${url.search}`;
}

async function sendSigned<TResponse>(params: {
  method: SignedMethod;
  path: string;
  body: Uint8Array;
  contentType: string;
  privateKey: string;
}): Promise<TResponse> {
  const { method, body, contentType, privateKey } = params;
  const fullPath = toSignedPath(params.path);
  const ts = Date.now();
  const nonce = freshNonce();

  const message = canonicalSignedMessage({
    method,
    path: fullPath,
    ts,
    nonce,
    bodySha256: bodySha256Hex(body),
  });
  const signature = signMessage(message, privateKey);

  const response = await fetch(fullPath, {
    method,
    headers: {
      "Content-Type": contentType,
      [SIGNATURE_HEADER]: signature,
      [TIMESTAMP_HEADER]: String(ts),
      [NONCE_HEADER]: nonce,
    },
    body: body as BodyInit,
  });
  if (!response.ok) {
    const error = (await response.json().catch(() => ({}))) as {
      error?: string;
    };
    throw new Error(error.error ?? `Request failed (${response.status})`);
  }
  return (await response.json()) as TResponse;
}

/**
 * Generic signed JSON request. Accepts any mutating HTTP method. The body is serialised ONCE, that
 * exact string is hashed and signed (see signed-envelope.ts), and it is sent untouched; the
 * signature, timestamp and nonce travel in headers.
 */
export async function requestSigned<TResponse>(
  method: SignedMethod,
  path: string,
  payload: Record<string, unknown>,
  privateKey: string
): Promise<TResponse> {
  const body = new TextEncoder().encode(JSON.stringify(payload));
  return sendSigned<TResponse>({
    method,
    path,
    body,
    contentType: "application/json",
    privateKey,
  });
}

/** Thin wrapper around requestSigned for POST requests. */
export async function postSigned<TResponse>(
  path: string,
  payload: Record<string, unknown>,
  privateKey: string
): Promise<TResponse> {
  return requestSigned<TResponse>("POST", path, payload, privateKey);
}

/**
 * Signed raw-bytes upload (e.g. chat attachment). The file is the request body, sent with its own
 * `Content-Type`. `path` may carry a query string (e.g. `/chat/1/attachment?name=a.png`): it is part
 * of the signed path, so the metadata in it cannot be altered either.
 */
export async function uploadSigned<TResponse>(
  path: string,
  file: Blob,
  privateKey: string,
  method: SignedMethod = "POST"
): Promise<TResponse> {
  const body = new Uint8Array(await file.arrayBuffer());
  return sendSigned<TResponse>({
    method,
    path,
    body,
    contentType: file.type || "application/octet-stream",
    privateKey,
  });
}
