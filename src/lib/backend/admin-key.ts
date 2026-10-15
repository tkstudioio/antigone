import "server-only";

import { secp256k1 } from "@noble/curves/secp256k1.js";
import { hex } from "@scure/base";

/**
 * The platform admin identity on the server: a PUBLIC key only.
 *
 * `ADMIN_PUBKEY` (33-byte compressed secp256k1 point, hex) is the single source of truth for the
 * `isAdmin` check, the escrow arbiter pubkey at checkout, and the recipient of the dispute chat
 * re-encryption. The server never holds the matching private key: the arbiter signs dispute
 * settlements in the admin's own browser (see `src/lib/ark/dispute.ts`). Instance operators derive
 * the value locally with `yarn derive:pubkey`.
 *
 * Memoized (the env does not change at runtime). Returns null — admin disabled — when the variable
 * is missing or is not a valid compressed point; the problem is logged once.
 */
let cached: { value: string | null } | undefined;

export function getAdminPubkey(): string | null {
  if (cached) return cached.value;

  const raw = process.env.ADMIN_PUBKEY?.trim();
  if (!raw) {
    console.error("Missing ADMIN_PUBKEY in env: admin is disabled");
    cached = { value: null };
    return null;
  }

  try {
    const bytes = hex.decode(raw.toLowerCase());
    if (bytes.length !== 33) throw new Error("expected 33 bytes (compressed pubkey)");
    // Throws when the bytes are not a valid point on the curve.
    const normalized = hex.encode(bytes);
    secp256k1.Point.fromHex(normalized);
    cached = { value: normalized };
  } catch (err) {
    console.error(
      "Invalid ADMIN_PUBKEY (expected a 33-byte compressed secp256k1 pubkey in hex): admin is disabled",
      err
    );
    cached = { value: null };
  }
  return cached.value;
}
