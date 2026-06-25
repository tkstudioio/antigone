import "server-only";

import { hex } from "@scure/base";

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
  if (funded && (escrow.status === "awaitingFunds" || escrow.status === "partiallyFunded")) {
    await db.escrow.update({
      where: { address: escrow.address },
      data: { status: "fundLocked", fundedAt: new Date() },
    });
    escrowStatus = "fundLocked";
  } else if (
    total === 0 &&
    escrow.fundedAt != null &&
    (escrow.status === "fundLocked" || escrow.status === "disputed")
  ) {
    // The escrow was funded (`fundedAt` set) but its VTXOs are gone with no release/settlement in
    // flight (`fundLocked`/`disputed` — NOT `sellerReady`/`settling`, where a legitimate spend may be
    // mid-relay). The only way the funds vanish in these states is the operator sweeping them after
    // batch expiry. Mark terminal so the UI stops inviting actions that can no longer succeed.
    await db.escrow.update({
      where: { address: escrow.address },
      data: { status: "expiredSwept" },
    });
    escrowStatus = "expiredSwept";
  }

  return { ok: true, funded, total, escrowStatus };
}

export async function confirmOrder(params: {
  sellerPubkey: string;
  orderId: number;
}): Promise<{ ok: true } | { error: string; status: number }> {
  const { sellerPubkey, orderId } = params;

  const orderRow = await db.order.findFirst({
    where: { id: orderId, sellerPubkey },
  });

  if (!orderRow) return { error: "Ordine non trovato", status: 404 };
  if (orderRow.status === "completed") return { error: "Ordine già completato", status: 409 };
  if (orderRow.status === "disputed") return { error: "Ordine in disputa", status: 409 };
  if (!orderRow.escrowAddress) return { error: "Escrow mancante", status: 409 };

  const escrow = await db.escrow.findUnique({ where: { address: orderRow.escrowAddress } });
  if (!escrow) return { error: "Escrow non trovato", status: 404 };

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
    return { error: "L'escrow non è ancora finanziato", status: 409 };
  }

  await db.key.updateMany({
    where: { orderId },
    data: { buyerPubkey: orderRow.buyerPubkey },
  });

  await db.order.update({
    where: { id: orderId },
    data: { status: "completed", completedAt: new Date() },
  });

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
}): Promise<{ ok: true } | { error: string; status: number }> {
  const { orderId, pubkey, signature } = params;

  const orderRow = await db.order.findUnique({ where: { id: orderId } });
  if (!orderRow) return { error: "Ordine non trovato", status: 404 };
  if (orderRow.buyerPubkey !== pubkey && orderRow.sellerPubkey !== pubkey) {
    return { error: "Accesso non autorizzato", status: 403 };
  }
  if ((DISPUTE_BLOCKED_STATUSES as readonly string[]).includes(orderRow.status)) {
    return { error: "Impossibile aprire una disputa per questo ordine", status: 409 };
  }

  const escrow = orderRow.escrowAddress
    ? await db.escrow.findUnique({ where: { address: orderRow.escrowAddress } })
    : null;
  if (!escrow || !(DISPUTABLE_ESCROW_STATUSES as readonly string[]).includes(escrow.status)) {
    return { error: "Impossibile aprire una disputa per questo escrow", status: 409 };
  }

  await db.$transaction(async (tx) => {
    await tx.order.update({ where: { id: orderId }, data: { status: "disputed" } });

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

export async function concludeOrderAsAdmin(params: {
  orderId: number;
  refundAmount: number;
  conclusionStatus: string;
  favouredRole: string;
  refundedKeyIds: number[];
  refundSignature: string;
}): Promise<{ ok: true } | { error: string; status: number }> {
  const { orderId, refundAmount, conclusionStatus, favouredRole, refundedKeyIds, refundSignature } =
    params;

  const orderRow = await db.order.findUnique({
    where: { id: orderId },
    include: {
      keys: { select: { id: true, price: true } },
      chat: { select: { id: true } },
    },
  });

  if (!orderRow) return { error: "Ordine non trovato", status: 404 };

  // A verdict becomes final only once the escrow is settled on-chain (terminal status). While the
  // escrow stays `disputed`, the admin may re-conclude — e.g. switch the favoured party to the buyer
  // when the seller never drives the settlement — overwriting the previous verdict. With no escrow
  // there is nothing to settle on-chain, so the first conclusion is already final.
  let escrowStatus: string | undefined;
  if (orderRow.escrowAddress) {
    const escrowRow = await db.escrow.findUnique({
      where: { address: orderRow.escrowAddress },
      select: { status: true },
    });
    escrowStatus = escrowRow?.status;
  }
  const escrowSettled = escrowStatus
    ? ["completed", "refunded", "expiredSwept"].includes(escrowStatus)
    : orderRow.status === "concluded";
  if (escrowSettled) {
    return { error: "Disputa già liquidata, non modificabile", status: 409 };
  }

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
    return { error: "Importo non valido: rimborso + commissioni superano il totale", status: 422 };
  }

  const orderKeyIds = new Set(orderRow.keys.map((k) => k.id));
  for (const keyId of refundedKeyIds) {
    if (!orderKeyIds.has(keyId)) {
      return { error: "Chiave non appartiene all'ordine", status: 422 };
    }
  }

  const refundedKeySet = new Set(refundedKeyIds);
  const keptKeyIds = orderRow.keys.map((k) => k.id).filter((id) => !refundedKeySet.has(id));

  // Source of truth: the refund equals the sum of the refunded keys' prices, and the conclusion
  // status is derived from how many keys are refunded. The client computes both and signs them; we
  // re-derive server-side and reject mismatches so the signature always binds the real settlement.
  const expectedRefund = orderRow.keys
    .filter((k) => refundedKeySet.has(k.id))
    .reduce((sum, k) => sum + k.price, 0);
  if (refundAmount !== expectedRefund) {
    return { error: "Importo rimborso non coerente con gli articoli selezionati", status: 422 };
  }
  const derivedStatus = deriveConclusionStatus(refundedKeyIds.length, orderRow.keys.length);
  if (conclusionStatus !== derivedStatus) {
    return { error: "Esito disputa non coerente con gli articoli selezionati", status: 422 };
  }

  const conclusionStatusLabels: Record<string, string> = {
    completed: "Completato",
    partially_refunded: "Parzialmente rimborsato",
    cancelled: "Annullato",
  };
  const statusLabel = conclusionStatusLabels[conclusionStatus] ?? conclusionStatus;

  const systemMessage =
    `${isReconclusion ? "Verdetto aggiornato" : "Disputa conclusa"}. Esito: ${statusLabel}. ` +
    `Rimborso acquirente: ${refundAmount.toLocaleString("en-US")} sats. ` +
    `Commissioni: ${breakdown.adminReceives.toLocaleString("en-US")} sats. ` +
    `Quota venditore: ${breakdown.sellerReceives.toLocaleString("en-US")} sats.` +
    (escrowFunded ? " Liquidazione on-chain in attesa della parte favorita." : "");

  // When the escrow is funded: record the verdict but keep the escrow in `disputed` so the
  // favoured party can drive the on-chain settlement (prepare → finalize via leaf 1/2).
  // When NOT funded: conclude directly to the terminal status (no on-chain settlement needed).
  const escrowStatusForConclusion = escrowFunded
    ? "disputed"
    : conclusionStatus === "completed"
      ? "completed"
      : "refunded";

  await db.$transaction(async (tx) => {
    await tx.order.update({
      where: { id: orderId },
      data: {
        status: "concluded",
        refundAmount,
        conclusionStatus,
        favouredRole,
        refundSignature,
        adminDisputeShare,
        concludedAt: new Date(),
      },
    });

    if (orderRow.escrowAddress) {
      await tx.escrow.update({
        where: { address: orderRow.escrowAddress },
        data: { status: escrowStatusForConclusion },
      });
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

  return { ok: true };
}
