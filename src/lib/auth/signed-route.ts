import "server-only";

import { schnorr } from "@noble/curves/secp256k1.js";
import { hex } from "@scure/base";
import type { Session } from "next-auth";
import type { NextRequest } from "next/server";
import type { z } from "zod";
import { db } from "@/db";
import { requireAdminRoute, requireSessionRoute } from "@/lib/auth/session";
import {
  bodySha256Hex,
  canonicalSignedMessage,
  NONCE_HEADER,
  SIGNATURE_HEADER,
  SIGNED_REQUEST_CLOCK_SKEW_MS,
  SIGNED_REQUEST_TTL_MS,
  TIMESTAMP_HEADER,
} from "@/lib/auth/signed-envelope";
import { toXOnly } from "@/lib/utils";

/**
 * The single server-side entry point for signed mutations. A route exports
 * `signedRoute({ ... })` instead of a bare handler; there is no other way to verify a signature.
 *
 * Pipeline: auth gating -> read raw body -> hash -> rebuild the v2 envelope -> freshness -> Schnorr
 * verify against the signer pubkey -> persist a `SignedAction` row (the unique nonce is the
 * anti-replay store) -> validate the payload with the Zod schema -> call the handler.
 *
 * Signer:
 *  - `session`      the logged-in user's pubkey;
 *  - `admin`        the logged-in admin's pubkey (non-admin sessions get 403 before verification);
 *  - `body-pubkey`  the `pubkey` field inside the JSON body (pre-session routes, i.e. register).
 */

export type SignedSigner = "session" | "admin" | "body-pubkey";

/** The persisted evidence row of the request being handled. */
export type VerifiedAction = {
  id: number;
  pubkey: string;
  signature: string;
  nonce: string;
  ts: number;
  bodySha256: string;
};

type SessionFor<TSigner extends SignedSigner> = TSigner extends "body-pubkey" ? null : Session;

/** Dynamic route segments (always strings), e.g. `{ id: "12" }`. */
type RouteParams = Record<string, string>;

type RouteContext = { params: Promise<RouteParams> };

export type SignedJsonContext<TSchema extends z.ZodType, TSigner extends SignedSigner> = {
  req: NextRequest;
  params: RouteParams;
  session: SessionFor<TSigner>;
  pubkey: string;
  payload: z.output<TSchema>;
  action: VerifiedAction;
};

export type SignedRawContext<TSigner extends Exclude<SignedSigner, "body-pubkey">> = {
  req: NextRequest;
  params: RouteParams;
  session: SessionFor<TSigner>;
  pubkey: string;
  bytes: Uint8Array;
  contentType: string;
  action: VerifiedAction;
};

type JsonOptions<TSchema extends z.ZodType, TSigner extends SignedSigner> = {
  body?: "json";
  schema: TSchema;
  signer: TSigner;
  /**
   * Persist the raw JSON body text in `signed_action.body` (default true). Set to false for bodies
   * that carry secrets in plaintext; only the hash is stored then.
   */
  storeBody?: boolean;
  handler: (ctx: SignedJsonContext<TSchema, TSigner>) => Promise<Response> | Response;
};

type RawOptions<TSigner extends Exclude<SignedSigner, "body-pubkey">> = {
  body: "raw";
  signer: TSigner;
  /** Hard cap on the body size, checked on `Content-Length` and on the bytes actually read. */
  maxBytes: number;
  /** Error message returned with 413 when `maxBytes` is exceeded. */
  maxBytesMessage?: string;
  handler: (ctx: SignedRawContext<TSigner>) => Promise<Response> | Response;
};

function fail(status: number, error: string): Response {
  return Response.json({ error }, { status });
}

function isUniqueViolation(err: unknown): boolean {
  return typeof err === "object" && err !== null && (err as { code?: unknown }).code === "P2002";
}

type Verified = {
  session: Session | null;
  pubkey: string;
  bytes: Uint8Array;
  action: VerifiedAction;
  /** Parsed JSON body (json mode only). */
  json?: unknown;
};

async function verifySignedRequest(
  req: NextRequest,
  opts: {
    signer: SignedSigner;
    mode: "json" | "raw";
    storeBody: boolean;
    maxBytes?: number;
    maxBytesMessage?: string;
  }
): Promise<{ ok: true; value: Verified } | { ok: false; response: Response }> {
  const { signer, mode } = opts;

  // 1. Auth gating (before any verification work).
  let session: Session | null = null;
  if (signer === "session") {
    const auth = await requireSessionRoute();
    if (!auth.ok) return { ok: false, response: auth.response };
    session = auth.session;
  } else if (signer === "admin") {
    const auth = await requireAdminRoute();
    if (!auth.ok) return { ok: false, response: auth.response };
    session = auth.session;
  }

  // 2. Signature metadata headers.
  const signature = req.headers.get(SIGNATURE_HEADER);
  const tsHeader = req.headers.get(TIMESTAMP_HEADER);
  const nonce = req.headers.get(NONCE_HEADER);
  if (!signature || !tsHeader || !nonce) {
    return { ok: false, response: fail(401, "Missing signature") };
  }
  const ts = Number(tsHeader);
  if (!Number.isSafeInteger(ts)) {
    return { ok: false, response: fail(401, "Request timestamp out of range") };
  }

  // 3. Raw body (size-capped for raw mode).
  if (opts.maxBytes != null) {
    const declared = Number(req.headers.get("content-length") ?? "0");
    if (declared > opts.maxBytes) {
      return { ok: false, response: fail(413, opts.maxBytesMessage ?? "Request body too large") };
    }
  }
  const bytes = new Uint8Array(await req.arrayBuffer());
  if (opts.maxBytes != null && bytes.length > opts.maxBytes) {
    return { ok: false, response: fail(413, opts.maxBytesMessage ?? "Request body too large") };
  }

  // 4. Parse JSON (json mode); needed up front to resolve a body-pubkey signer.
  let json: unknown;
  let bodyText: string | null = null;
  if (mode === "json") {
    bodyText = new TextDecoder().decode(bytes);
    try {
      json = JSON.parse(bodyText);
    } catch {
      return { ok: false, response: fail(400, "Invalid JSON body") };
    }
  }

  // 5. Resolve the signer pubkey.
  let pubkey: string;
  if (signer === "body-pubkey") {
    const candidate = (json as { pubkey?: unknown } | null)?.pubkey;
    if (typeof candidate !== "string" || candidate.length === 0) {
      return { ok: false, response: fail(400, "Invalid request body") };
    }
    pubkey = candidate;
  } else {
    pubkey = session!.user.pubkey;
  }

  // 6. Freshness: stale requests and requests future-dated beyond a small clock skew are rejected,
  // so a signature is only ever "fresh" within roughly [ts - skew, ts + TTL].
  const age = Date.now() - ts;
  if (age > SIGNED_REQUEST_TTL_MS || age < -SIGNED_REQUEST_CLOCK_SKEW_MS) {
    return { ok: false, response: fail(401, "Request timestamp out of range") };
  }

  // 7. Rebuild the envelope from the request itself and verify the Schnorr signature.
  const url = new URL(req.url);
  const bodySha256 = bodySha256Hex(bytes);
  const message = new TextEncoder().encode(
    canonicalSignedMessage({
      method: req.method.toUpperCase(),
      path: `${url.pathname}${url.search}`,
      ts,
      nonce,
      bodySha256,
    })
  );
  let valid = false;
  try {
    valid = schnorr.verify(hex.decode(signature), message, toXOnly(hex.decode(pubkey)));
  } catch {
    valid = false;
  }
  if (!valid) return { ok: false, response: fail(401, "Invalid signature") };

  // 8. Persist the evidence. The unique nonce is the anti-replay store: it is inserted only after a
  // valid signature (an attacker cannot grief by pre-consuming nonces) and kept forever.
  let action: VerifiedAction;
  try {
    const row = await db.signedAction.create({
      data: {
        pubkey,
        method: req.method.toUpperCase(),
        path: `${url.pathname}${url.search}`,
        ts: BigInt(ts),
        nonce,
        bodySha256,
        body: mode === "json" && opts.storeBody ? bodyText : null,
        signature,
      },
      select: { id: true },
    });
    action = { id: row.id, pubkey, signature, nonce, ts, bodySha256 };
  } catch (err) {
    if (isUniqueViolation(err)) return { ok: false, response: fail(409, "Replay detected") };
    throw err;
  }

  return { ok: true, value: { session, pubkey, bytes, action, json } };
}

export function signedRoute<TSchema extends z.ZodType, TSigner extends SignedSigner>(
  options: JsonOptions<TSchema, TSigner>
): (req: NextRequest, ctx: RouteContext) => Promise<Response>;
export function signedRoute<TSigner extends Exclude<SignedSigner, "body-pubkey">>(
  options: RawOptions<TSigner>
): (req: NextRequest, ctx: RouteContext) => Promise<Response>;
export function signedRoute(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  options: JsonOptions<z.ZodType, SignedSigner> | RawOptions<any>
): (req: NextRequest, ctx: RouteContext) => Promise<Response> {
  return async (req, ctx) => {
    const params = ctx?.params ? await ctx.params : {};

    if (options.body === "raw") {
      const result = await verifySignedRequest(req, {
        signer: options.signer,
        mode: "raw",
        storeBody: false,
        maxBytes: options.maxBytes,
        maxBytesMessage: options.maxBytesMessage,
      });
      if (!result.ok) return result.response;
      const { session, pubkey, bytes, action } = result.value;
      return options.handler({
        req,
        params,
        session,
        pubkey,
        bytes,
        contentType: req.headers.get("content-type")?.split(";")[0]?.trim().toLowerCase() ?? "",
        action,
      });
    }

    const result = await verifySignedRequest(req, {
      signer: options.signer,
      mode: "json",
      storeBody: options.storeBody ?? true,
    });
    if (!result.ok) return result.response;
    const { session, pubkey, action, json } = result.value;

    // The signed request is already stored (audit record); a payload that fails the schema is 422.
    const parsed = options.schema.safeParse(json);
    if (!parsed.success) {
      return fail(422, parsed.error.issues[0]?.message ?? "Invalid request body");
    }

    return options.handler({
      req,
      params,
      session,
      pubkey,
      payload: parsed.data,
      action,
    });
  };
}
