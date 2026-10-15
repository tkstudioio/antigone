import "server-only";

import type { Prisma } from "@prisma/client";
import type { SignedActionRecord } from "@/lib/auth/verify-signed-action";

/** Prisma `select` for the fields of a `SignedAction` the API returns as verifiable evidence. */
export const SIGNED_ACTION_SELECT = {
  id: true,
  pubkey: true,
  method: true,
  path: true,
  ts: true,
  nonce: true,
  bodySha256: true,
  body: true,
  signature: true,
} satisfies Prisma.SignedActionSelect;

type SignedActionRow = Prisma.SignedActionGetPayload<{ select: typeof SIGNED_ACTION_SELECT }>;

/**
 * Serialize a persisted signed action for the API (`ts` BigInt → number). Clients re-verify it with
 * `verifySignedAction` (`src/lib/auth/verify-signed-action.ts`) and read values from its body.
 */
export function toSignedActionRecord(
  row: SignedActionRow | null | undefined
): SignedActionRecord | null {
  if (!row) return null;
  return {
    id: row.id,
    pubkey: row.pubkey,
    method: row.method,
    path: row.path,
    ts: Number(row.ts),
    nonce: row.nonce,
    bodySha256: row.bodySha256,
    body: row.body,
    signature: row.signature,
  };
}
