import "server-only";

import { hex } from "@scure/base";
import type { Prisma } from "@prisma/client";

import { db } from "@/db";
import { getEscrowFunding, getEscrowVtxoSet } from "@/lib/ark/funding";
import { deriveRecipientPkScript } from "@/lib/ark/escrow";
import {
  decodeSettlementTx,
  assertSpendsOnlyEscrow,
  assertOutputsMatch,
  assertValueConserved,
  type ExpectedOutput,
} from "@/lib/ark/tx-validation";
import { calculateAdminDisputeShare, computeDisputeBreakdown } from "@/lib/fees";
import { deriveConclusionStatus } from "@/lib/orders-status";
import { isDisputeStatus } from "@/lib/backend/dispute-access";

/**
 * Query the Arkade indexer for the escrow of an order and, if the locked amount covers the
 * price, transition the escrow to `fundLocked`. Idempotent and safe to call from either party.
 */
export async function verifyEscrowFunding(params: {
  orderId: number;
  pubkey: string;
}): Promise<
  | { ok: true; funded: boolean; total: number; escrowStatus: string }
  | { error: string; status: number }
> {
  const { orderId, pubkey } = params;

  const orderRow = await db.order.findFirst({
    where: { id: orderId, OR: [{ buyerPubkey: pubkey }, { sellerPubkey: pubkey }] },
  });
  if (!orderRow) return { error: "Ordine non trovato", status: 404 };
  if (!orderRow.escrowAddress) return { error: "Escrow mancante", status: 409 };

  const escrow = await db.escrow.findUnique({ where: { address: orderRow.escrowAddress } });
  if (!escrow) return { error: "Escrow non trovato", status: 404 };

  const { funded, total } = await getEscrowFunding(escrow.address, escrow.price);

  let escrowStatus = escrow.status;
  // A cancelled order's keys were put back on sale: a late payment must not revive its escrow.
  if (orderRow.status === "cancelled") {
    return { ok: true, funded, total, escrowStatus };
  }
  if (funded && (escrow.status === "awaitingFunds" || escrow.status === "partiallyFunded")) {
    await db.escrow.update({
      where: { address: escrow.address },
      data: { status: "fundLocked", fundedAt: new Date() },
    });
    escrowStatus = "fundLocked";
  } else if (
    total === 0 &&
    escrow.fundedAt != null &&
    (escrow.status === "fundLocked" ||
      escrow.status === "disputed" ||
      escrow.status === "settlementPrepared")
  ) {
    // The escrow was funded (`fundedAt` set) but its VTXOs are gone with no release/settlement in
    // flight (`fundLocked`/`disputed`/`settlementPrepared` — the latter only holds a persisted,
    // not-yet-submitted PSBT, so the funds are still unspent — NOT `sellerReady`/`settling`, where
    // a legitimate spend may be mid-relay). The only way the funds vanish in these states is the
    // operator sweeping them after batch expiry. Mark terminal so the UI stops inviting actions
    // that can no longer succeed.
    await db.escrow.update({
      where: { address: escrow.address },
      data: { status: "expiredSwept" },
    });
    escrowStatus = "expiredSwept";
  }

  return { ok: true, funded, total, escrowStatus };
}

/** One content-key wrap of a license code, as sent by the client (recipient implicit). */
export type KeyCodeWrap = { keyId: number; wrappedCek: string };

/**
 * Check that `wraps` covers EXACTLY the keys of the order: no missing key, no extra key, no key of
 * another order, no duplicate. Returns an error response descriptor, or null when complete.
 */
async function validateCompleteWraps(
  orderId: number,
  wraps: KeyCodeWrap[]
): Promise<{ error: string; status: number } | null> {
  const orderKeys = await db.key.findMany({ where: { orderId }, select: { id: true } });
  const orderKeyIds = new Set(orderKeys.map((k) => k.id));
  const wrapKeyIds = new Set(wraps.map((w) => w.keyId));
  if (wrapKeyIds.size !== wraps.length) {
    return { error: "Duplicate key wraps", status: 422 };
  }
  for (const id of wrapKeyIds) {
    if (!orderKeyIds.has(id)) return { error: "Key does not belong to the order", status: 422 };
  }
  for (const id of orderKeyIds) {
    if (!wrapKeyIds.has(id)) return { error: "Missing key wrap for an order key", status: 422 };
  }
  return null;
}

/**
 * Upsert the buyer's wrapped content keys (wrapper = the delivering seller). Each row links to the
 * signed delivery request (`actionId`) as its evidence.
 */
async function storeBuyerWraps(
  tx: Prisma.TransactionClient,
  params: { sellerPubkey: string; buyerPubkey: string; wraps: KeyCodeWrap[]; actionId: number }
): Promise<void> {
  const { sellerPubkey, buyerPubkey, wraps, actionId } = params;
  for (const w of wraps) {
    await tx.keyCodeKey.upsert({
      where: { uq_key_code_key_recipient: { keyId: w.keyId, recipientPubkey: buyerPubkey } },
      create: {
        keyId: w.keyId,
        recipientPubkey: buyerPubkey,
        wrapperPubkey: sellerPubkey,
        wrappedCek: w.wrappedCek,
        signedActionId: actionId,
      },
      update: { wrapperPubkey: sellerPubkey, wrappedCek: w.wrappedCek, signedActionId: actionId },
    });
  }
}

/**
 * Seller confirmation = delivery. The seller's browser re-wrapped the content key of every order key
 * toward the buyer; the server requires the complete set, stores it, then performs the transition
 * (keys assigned to the buyer, order `completed`) — all in one transaction.
 */
export async function confirmOrder(params: {
  sellerPubkey: string;
  orderId: number;
  keys: KeyCodeWrap[];
  /** The persisted signed confirmation (the seller's evidence of what was delivered). */
  actionId: number;
}): Promise<{ ok: true } | { error: string; status: number }> {
  const { sellerPubkey, orderId, keys, actionId } = params;

  const orderRow = await db.order.findFirst({
    where: { id: orderId, sellerPubkey },
  });

  if (!orderRow) return { error: "Order not found", status: 404 };
  if (orderRow.status === "completed") return { error: "Order already completed", status: 409 };
  if (orderRow.status === "disputed") return { error: "Order is in dispute", status: 409 };
  if (orderRow.status === "cancelled") return { error: "Order cancelled", status: 409 };
  if (!orderRow.escrowAddress) return { error: "Escrow missing", status: 409 };

  const escrow = await db.escrow.findUnique({ where: { address: orderRow.escrowAddress } });
  if (!escrow) return { error: "Escrow not found", status: 404 };

  // The seller may only deliver the keys once the buyer has locked the funds in the escrow.
  let escrowStatus = escrow.status;
  if (escrowStatus === "awaitingFunds" || escrowStatus === "partiallyFunded") {
    const { funded } = await getEscrowFunding(escrow.address, escrow.price);
    if (funded) {
      await db.escrow.update({
        where: { address: escrow.address },
        data: { status: "fundLocked", fundedAt: new Date() },
      });
      escrowStatus = "fundLocked";
    }
  }
  if (escrowStatus !== "fundLocked") {
    return { error: "The escrow is not funded yet", status: 409 };
  }

  const wrapsError = await validateCompleteWraps(orderId, keys);
  if (wrapsError) return wrapsError;

  await db.$transaction(async (tx) => {
    await storeBuyerWraps(tx, {
      sellerPubkey,
      buyerPubkey: orderRow.buyerPubkey,
      wraps: keys,
      actionId,
    });

    await tx.key.updateMany({
      where: { orderId },
      data: { buyerPubkey: orderRow.buyerPubkey },
    });

    await tx.order.update({
      where: { id: orderId },
      data: { status: "completed", completedAt: new Date(), confirmActionId: actionId },
    });
  });

  return { ok: true };
}

/**
 * Seller delivers the keys while the order is pending or in dispute — typically a dispute opened
 * before confirmation, so the verdict can let the buyer keep the keys. Same validation as
 * `confirmOrder`, but NO status change: the buyer only sees the codes once the verdict assigns them.
 */
export async function deliverOrderKeys(params: {
  sellerPubkey: string;
  orderId: number;
  keys: KeyCodeWrap[];
  /** The persisted signed delivery request. */
  actionId: number;
}): Promise<{ ok: true } | { error: string; status: number }> {
  const { sellerPubkey, orderId, keys, actionId } = params;

  const orderRow = await db.order.findFirst({ where: { id: orderId, sellerPubkey } });
  if (!orderRow) return { error: "Order not found", status: 404 };
  if (orderRow.status !== "pending" && orderRow.status !== "disputed") {
    return {
      error: "Keys can only be delivered while the order is pending or in dispute",
      status: 409,
    };
  }

  const wrapsError = await validateCompleteWraps(orderId, keys);
  if (wrapsError) return wrapsError;

  await db.$transaction(async (tx) => {
    await storeBuyerWraps(tx, {
      sellerPubkey,
      buyerPubkey: orderRow.buyerPubkey,
      wraps: keys,
      actionId,
    });
    // The latest delivery is the order's delivery evidence (no status change).
    await tx.order.update({ where: { id: orderId }, data: { confirmActionId: actionId } });
  });

  return { ok: true };
}

/**
 * A party re-wraps the content keys it can open toward the escrow arbiter, so the arbiter can read
 * the codes during a dispute. Dispute only; party only; every key must belong to the order AND the
 * caller must hold its own wrap (it cannot share what it cannot open). Callable again while the
 * order is in dispute (e.g. the seller adding undelivered codes as evidence).
 */
export async function grantArbiterKeys(params: {
  orderId: number;
  pubkey: string;
  keys: KeyCodeWrap[];
  /** The persisted signed grant request. */
  actionId: number;
}): Promise<{ ok: true } | { error: string; status: number }> {
  const { orderId, pubkey, keys, actionId } = params;

  const orderRow = await db.order.findUnique({ where: { id: orderId } });
  if (!orderRow) return { error: "Order not found", status: 404 };
  if (orderRow.buyerPubkey !== pubkey && orderRow.sellerPubkey !== pubkey) {
    return { error: "Unauthorized access", status: 403 };
  }
  if (!isDisputeStatus(orderRow.status)) {
    return { error: "The order is not in dispute", status: 403 };
  }

  const escrow = orderRow.escrowAddress
    ? await db.escrow.findUnique({
        where: { address: orderRow.escrowAddress },
        select: { arbiterPubkey: true },
      })
    : null;
  const arbiterPubkey = escrow?.arbiterPubkey;
  if (!arbiterPubkey) return { error: "The escrow has no arbiter", status: 409 };

  const wrapKeyIds = new Set(keys.map((k) => k.keyId));
  if (wrapKeyIds.size !== keys.length) return { error: "Duplicate key wraps", status: 422 };

  const ownWraps = await db.keyCodeKey.findMany({
    where: { keyId: { in: [...wrapKeyIds] }, recipientPubkey: pubkey, key: { orderId } },
    select: { keyId: true },
  });
  const ownKeyIds = new Set(ownWraps.map((w) => w.keyId));
  for (const id of wrapKeyIds) {
    if (!ownKeyIds.has(id)) {
      return { error: "Key not part of the order or not readable by the caller", status: 422 };
    }
  }

  await db.$transaction(
    keys.map((w) =>
      db.keyCodeKey.upsert({
        where: { uq_key_code_key_recipient: { keyId: w.keyId, recipientPubkey: arbiterPubkey } },
        create: {
          keyId: w.keyId,
          recipientPubkey: arbiterPubkey,
          wrapperPubkey: pubkey,
          wrappedCek: w.wrappedCek,
          signedActionId: actionId,
        },
        update: { wrapperPubkey: pubkey, wrappedCek: w.wrappedCek, signedActionId: actionId },
      })
    )
  );

  return { ok: true };
}

// ─── Collaborative release (happy path) ─────────────────────────────────────
// Buyer and seller keys live only in their browsers and are never online together, so the
// path-1 (buyer + seller + operator) release is relayed through the DB in three signed steps:
// seller arms it (prepare), buyer submits + countersigns the checkpoints (collaborate), seller
// broadcasts the finalized checkpoints (finalize). All Arkade tx building/signing happens
// client-side; these mutations only persist the relayed PSBTs and advance the escrow status.

export async function prepareRelease(params: {
  orderId: number;
  sellerPubkey: string;
  sellerSignedCollabPsbt: string;
  checkpointPsbts: string[];
}): Promise<{ ok: true } | { error: string; status: number }> {
  const { orderId, sellerPubkey, sellerSignedCollabPsbt, checkpointPsbts } = params;

  const orderRow = await db.order.findFirst({ where: { id: orderId, sellerPubkey } });
  if (!orderRow) return { error: "Ordine non trovato", status: 404 };
  if (orderRow.status !== "completed")
    return { error: "Consegna le chiavi prima di preparare il rilascio", status: 409 };
  if (!orderRow.escrowAddress) return { error: "Escrow mancante", status: 409 };

  const escrow = await db.escrow.findUnique({ where: { address: orderRow.escrowAddress } });
  if (!escrow) return { error: "Escrow non trovato", status: 404 };
  if (escrow.status !== "fundLocked")
    return { error: "L'escrow non è pronto per il rilascio", status: 409 };

  // Validate the seller-built release tx before persisting it (defense-in-depth, mirrors the dispute
  // gate and the buyer's client-side check): it must spend ONLY this escrow's VTXOs and pay out the
  // locked total split into the platform fee (bound to the admin's pkScript) and the remainder (to
  // the seller, pkScript free). This is the gate that enforces the fee in the official flow.
  // Network call (indexer) must stay OUTSIDE any DB transaction.
  const { outpoints: allowedOutpoints, total } = await getEscrowVtxoSet(escrow.address);
  if (allowedOutpoints.size === 0)
    return { error: "Nessun fondo bloccato nell'escrow", status: 409 };
  const decoded = decodeSettlementTx(sellerSignedCollabPsbt, checkpointPsbts);
  if ("error" in decoded) return { error: `Transazione non valida: ${decoded.error}`, status: 422 };
  const bindingError = assertSpendsOnlyEscrow(
    decoded.arkTx,
    decoded.checkpointTxs,
    allowedOutpoints
  );
  if (bindingError) return { error: `Rilascio non valido: ${bindingError}`, status: 422 };
  const platformFee = orderRow.platformFee;
  const expectedOutputs: ExpectedOutput[] = [
    { amount: BigInt(total - platformFee), pkScriptHex: "" },
  ];
  if (platformFee > 0 && escrow.arbiterPubkey) {
    const adminPkScriptHex = hex.encode(
      deriveRecipientPkScript(escrow.arbiterPubkey, escrow.serverPubkey, escrow.exitDelay)
    );
    expectedOutputs.push({ amount: BigInt(platformFee), pkScriptHex: adminPkScriptHex });
  }
  const outputsError = assertOutputsMatch(decoded.arkTx, expectedOutputs);
  if (outputsError) return { error: `Rilascio non valido: ${outputsError}`, status: 422 };
  const valueError = assertValueConserved(decoded.arkTx, BigInt(total));
  if (valueError) return { error: `Rilascio non valido: ${valueError}`, status: 422 };

  await db.escrow.update({
    where: { address: escrow.address },
    data: {
      sellerSignedCollabPsbt,
      releaseCheckpointPsbts: JSON.stringify(checkpointPsbts),
      status: "sellerReady",
    },
  });

  return { ok: true };
}

export async function collaborateRelease(params: {
  orderId: number;
  buyerPubkey: string;
  collabArkTxid: string;
  serverSignedCheckpoints: string[];
  buyerSignedCheckpoints: string[];
}): Promise<{ ok: true } | { error: string; status: number }> {
  const { orderId, buyerPubkey, collabArkTxid, serverSignedCheckpoints, buyerSignedCheckpoints } =
    params;

  const orderRow = await db.order.findFirst({ where: { id: orderId, buyerPubkey } });
  if (!orderRow) return { error: "Ordine non trovato", status: 404 };
  if (!orderRow.escrowAddress) return { error: "Escrow mancante", status: 409 };

  const escrow = await db.escrow.findUnique({ where: { address: orderRow.escrowAddress } });
  if (!escrow) return { error: "Escrow non trovato", status: 404 };
  if (escrow.status !== "sellerReady")
    return { error: "Il rilascio non è stato ancora preparato dal venditore", status: 409 };

  await db.escrow.update({
    where: { address: escrow.address },
    data: {
      collabArkTxid,
      serverSignedCheckpoints: JSON.stringify(serverSignedCheckpoints),
      buyerSignedCheckpoints: JSON.stringify(buyerSignedCheckpoints),
      status: "buyerCheckpointsSigned",
    },
  });

  return { ok: true };
}

export async function finalizeRelease(params: {
  orderId: number;
  sellerPubkey: string;
}): Promise<{ ok: true } | { error: string; status: number }> {
  const { orderId, sellerPubkey } = params;

  const orderRow = await db.order.findFirst({ where: { id: orderId, sellerPubkey } });
  if (!orderRow) return { error: "Ordine non trovato", status: 404 };
  if (!orderRow.escrowAddress) return { error: "Escrow mancante", status: 409 };

  const escrow = await db.escrow.findUnique({ where: { address: orderRow.escrowAddress } });
  if (!escrow) return { error: "Escrow non trovato", status: 404 };
  if (escrow.status === "completed") return { ok: true };
  if (escrow.status !== "buyerCheckpointsSigned")
    return { error: "L'acquirente non ha ancora collaborato al rilascio", status: 409 };

  await db.escrow.update({
    where: { address: escrow.address },
    data: { status: "completed", releasedAt: new Date() },
  });

  return { ok: true };
}

// ─── Dispute ─────────────────────────────────────────────────────────────────

const DISPUTE_BLOCKED_STATUSES = ["cancelled", "refunded", "concluded", "disputed"] as const;
// A dispute only makes sense while funds are locked but the release is still pending. Once the
// buyer has collaborated (`buyerCheckpointsSigned`) only the seller's finalize remains, so the
// window closes there.
const DISPUTABLE_ESCROW_STATUSES = ["fundLocked", "sellerReady"] as const;

export async function openDispute(params: {
  orderId: number;
  pubkey: string;
  signature: string;
  /** The persisted signed dispute request (the opener's evidence). */
  actionId: number;
}): Promise<{ ok: true } | { error: string; status: number }> {
  const { orderId, pubkey, signature, actionId } = params;

  const orderRow = await db.order.findUnique({ where: { id: orderId } });
  if (!orderRow) return { error: "Order not found", status: 404 };
  if (orderRow.buyerPubkey !== pubkey && orderRow.sellerPubkey !== pubkey) {
    return { error: "Unauthorized access", status: 403 };
  }
  if ((DISPUTE_BLOCKED_STATUSES as readonly string[]).includes(orderRow.status)) {
    return { error: "Cannot open a dispute for this order", status: 409 };
  }

  const escrow = orderRow.escrowAddress
    ? await db.escrow.findUnique({ where: { address: orderRow.escrowAddress } })
    : null;
  if (!escrow || !(DISPUTABLE_ESCROW_STATUSES as readonly string[]).includes(escrow.status)) {
    return { error: "Cannot open a dispute for this escrow", status: 409 };
  }

  await db.$transaction(async (tx) => {
    await tx.order.update({
      where: { id: orderId },
      data: { status: "disputed", disputeActionId: actionId },
    });

    await tx.escrow.update({
      where: { address: escrow.address },
      data: { status: "disputed" },
    });

    const existing = await tx.chat.findUnique({ where: { orderId } });
    if (!existing) {
      await tx.chat.create({ data: { orderId, signature, status: "open" } });
    } else if (existing.status !== "open") {
      await tx.chat.update({ where: { id: existing.id }, data: { status: "open" } });
    }
  });

  return { ok: true };
}

/** Thrown inside the conclusion transaction when the escrow status moved under our feet. */
class EscrowChangedError extends Error {}

export async function concludeOrderAsAdmin(params: {
  orderId: number;
  refundAmount: number;
  conclusionStatus: string;
  favouredRole: string;
  refundedKeyIds: number[];
  refundSignature: string;
  /** The persisted signed verdict (the latest one is the order's verdict evidence). */
  actionId: number;
}): Promise<{ ok: true } | { error: string; status: number }> {
  const {
    orderId,
    refundAmount,
    conclusionStatus,
    favouredRole,
    refundedKeyIds,
    refundSignature,
    actionId,
  } = params;

  const orderRow = await db.order.findUnique({
    where: { id: orderId },
    include: {
      keys: { select: { id: true, price: true } },
      chat: { select: { id: true } },
    },
  });

  if (!orderRow) return { error: "Order not found", status: 404 };

  // A verdict becomes final once the arbiter has co-signed (`settling`) or the escrow is settled
  // (terminal status). While the escrow stays `disputed` or `settlementPrepared` (the favoured party
  // prepared, the arbiter has not co-signed — funds still unspent), the admin may re-conclude — e.g.
  // switch the favoured party to the buyer when the seller never drives the settlement —
  // overwriting the previous verdict. With no escrow there is nothing to settle on Ark, so the
  // first conclusion is already final.
  let escrowStatus: string | undefined;
  if (orderRow.escrowAddress) {
    const escrowRow = await db.escrow.findUnique({
      where: { address: orderRow.escrowAddress },
      select: { status: true },
    });
    escrowStatus = escrowRow?.status;
  }
  const escrowSettled = escrowStatus
    ? ["settling", "completed", "refunded", "expiredSwept"].includes(escrowStatus)
    : orderRow.status === "concluded";
  if (escrowSettled) {
    return { error: "Dispute already settled, not modifiable", status: 409 };
  }
  // The favoured party's prepared PSBT was built against the previous verdict: discard it and send
  // the escrow back to `disputed` so the (possibly new) favoured party prepares again.
  const discardPreparedSettlement = escrowStatus === "settlementPrepared";

  const isReconclusion = orderRow.status === "concluded";

  // Read escrow funding up front: the locked total decides both the settlement path (below) AND the
  // breakdown — an overfunding surplus (locked > price) is returned to the buyer so the eventual
  // settlement satisfies sum(outputs) == sum(inputs). Network call must happen OUTSIDE any DB tx.
  let escrowFunded = false;
  let lockedTotal: number | undefined;
  if (orderRow.escrowAddress) {
    // The buyer funds the goods price plus the platform-fee surcharge (= Escrow.price).
    const expectedLocked = orderRow.totalSats + orderRow.platformFee;
    const { funded, total } = await getEscrowFunding(orderRow.escrowAddress, expectedLocked);
    escrowFunded = funded;
    if (funded) lockedTotal = total;
  }

  const adminDisputeShare = calculateAdminDisputeShare(orderRow.totalSats);
  const breakdown = computeDisputeBreakdown({
    totalSats: orderRow.totalSats,
    refundAmount,
    platformFee: orderRow.platformFee,
    adminDisputeShare,
    lockedTotal,
  });

  if (refundAmount < 0 || !breakdown) {
    return { error: "Invalid amount: refund + fees exceed the total", status: 422 };
  }

  const orderKeyIds = new Set(orderRow.keys.map((k) => k.id));
  for (const keyId of refundedKeyIds) {
    if (!orderKeyIds.has(keyId)) {
      return { error: "Key does not belong to the order", status: 422 };
    }
  }

  const refundedKeySet = new Set(refundedKeyIds);
  const keptKeyIds = orderRow.keys.map((k) => k.id).filter((id) => !refundedKeySet.has(id));

  // A key can be retained for the buyer only if it was delivered (the seller wrapped its content key
  // toward the buyer): otherwise the buyer could never open it. Undelivered keys must be refunded.
  if (keptKeyIds.length > 0) {
    const deliveredRows = await db.keyCodeKey.findMany({
      where: { keyId: { in: keptKeyIds }, recipientPubkey: orderRow.buyerPubkey },
      select: { keyId: true },
    });
    const deliveredKeyIds = new Set(deliveredRows.map((r) => r.keyId));
    if (keptKeyIds.some((id) => !deliveredKeyIds.has(id))) {
      return {
        error: "Cannot retain keys that were not delivered to the buyer (refund only)",
        status: 422,
      };
    }
  }

  // Source of truth: the refund equals the sum of the refunded keys' prices, and the conclusion
  // status is derived from how many keys are refunded. The client computes both and signs them; we
  // re-derive server-side and reject mismatches so the signature always binds the real settlement.
  const expectedRefund = orderRow.keys
    .filter((k) => refundedKeySet.has(k.id))
    .reduce((sum, k) => sum + k.price, 0);
  if (refundAmount !== expectedRefund) {
    return { error: "Refund amount is inconsistent with the selected items", status: 422 };
  }
  const derivedStatus = deriveConclusionStatus(refundedKeyIds.length, orderRow.keys.length);
  if (conclusionStatus !== derivedStatus) {
    return { error: "Dispute outcome is inconsistent with the selected items", status: 422 };
  }

  const conclusionStatusLabels: Record<string, string> = {
    completed: "Completed",
    partially_refunded: "Partially refunded",
    cancelled: "Cancelled",
  };
  const statusLabel = conclusionStatusLabels[conclusionStatus] ?? conclusionStatus;

  const systemMessage =
    `${isReconclusion ? "Verdict updated" : "Dispute concluded"}. Outcome: ${statusLabel}. ` +
    `Buyer refund: ${refundAmount.toLocaleString("en-US")} sats. ` +
    `Fees: ${breakdown.adminReceives.toLocaleString("en-US")} sats. ` +
    `Seller share: ${breakdown.sellerReceives.toLocaleString("en-US")} sats.` +
    (escrowFunded ? " Ark settlement awaiting the favoured party." : "");

  // When the escrow is funded: record the verdict but keep the escrow in `disputed` so the
  // favoured party can drive the on-chain settlement (prepare → finalize via leaf 1/2).
  // When NOT funded: conclude directly to the terminal status (no on-chain settlement needed).
  const escrowStatusForConclusion = escrowFunded
    ? "disputed"
    : conclusionStatus === "completed"
      ? "completed"
      : "refunded";

  try {
    await db.$transaction(async (tx) => {
      await tx.order.update({
        where: { id: orderId },
        data: {
          status: "concluded",
          refundAmount,
          conclusionStatus,
          favouredRole,
          refundSignature,
          verdictActionId: actionId,
          adminDisputeShare,
          concludedAt: new Date(),
        },
      });

      if (orderRow.escrowAddress) {
        // Guarded on the status observed above: if the arbiter co-signed (`settling`) in the
        // meantime the verdict is final and must not be overwritten.
        const escrowUpdate = await tx.escrow.updateMany({
          where: { address: orderRow.escrowAddress, status: escrowStatus },
          data: {
            status: escrowStatusForConclusion,
            ...(discardPreparedSettlement
              ? {
                  disputeFavouredSignedArkPsbt: null,
                  disputeCheckpointPsbts: null,
                  disputeServerSignedCheckpoints: null,
                  disputeAdminSignedCheckpoints: null,
                  disputeArkTxid: null,
                }
              : {}),
          },
        });
        if (escrowUpdate.count === 0) throw new EscrowChangedError();
      }

      // Apply both sides of the selection so a re-conclusion flips keys cleanly (not just the first
      // pass): refunded keys lose buyer ownership; kept keys become the buyer's, so they can see the
      // decrypted code (the visibility rule in query-orders keys off `buyerPubkey`).
      if (refundedKeyIds.length > 0) {
        await tx.key.updateMany({
          where: { id: { in: refundedKeyIds } },
          data: { refunded: true, buyerPubkey: null },
        });
      }

      if (keptKeyIds.length > 0) {
        await tx.key.updateMany({
          where: { id: { in: keptKeyIds } },
          data: { refunded: false, buyerPubkey: orderRow.buyerPubkey },
        });
      }

      if (orderRow.chat) {
        // Keep the chat open while the escrow stays `disputed` (funded path): parties and admin may
        // still communicate during the on-chain settlement wait and any re-conclusions. The chat is
        // closed here only when this conclusion is already terminal (no on-chain settlement pending);
        // otherwise it is closed later, at `finalizeDisputeSettlement`.
        if (!escrowFunded) {
          await tx.chat.update({
            where: { id: orderRow.chat.id },
            data: { status: "closed" },
          });
        }

        await tx.message.create({
          data: {
            chatId: orderRow.chat.id,
            message: systemMessage,
            isSystem: true,
          },
        });
      }
    });
  } catch (err) {
    if (err instanceof EscrowChangedError) {
      return { error: "Dispute already settled, not modifiable", status: 409 };
    }
    throw err;
  }

  return { ok: true };
}
