import "server-only";

import { Transaction } from "@arkade-os/sdk";
import { base64 } from "@scure/base";

import { db } from "@/db";
import { getAdminPubkey } from "@/lib/backend/admin-key";
import { calculateAdminDisputeShare, computeDisputeBreakdown } from "@/lib/fees";
import { getEscrowVtxoSet } from "@/lib/ark/funding";
import { validateDisputeSettlementTx } from "@/lib/ark/dispute";
import type { EscrowParams } from "@/lib/ark/escrow";

/**
 * Dispute settlement mutations (arbiter-client-side-signing, phase 2 of the untrusted-server
 * roadmap). The server holds NO key and calls the operator for NOTHING here: every signature and
 * every `submitTx` / `finalizeTx` happens in a browser (`src/lib/ark/dispute.ts`). These mutations
 * only validate, persist the relayed PSBTs and advance the escrow status:
 *
 *   disputed ──prepare (favoured party)──▶ settlementPrepared ──cosign (arbiter)──▶ settling
 *   settling ──finalize (favoured party, after `finalizeTx` in its browser)──▶ completed | refunded
 */

/**
 * Resolve which party drives the on-chain settlement (and signs via their arbiter leaf). The admin
 * sets `favouredRole` explicitly at conclusion; for orders concluded before that field existed we
 * fall back to the legacy mapping (seller wins on "completed", buyer otherwise).
 */
function resolveFavouredRole(order: {
  favouredRole: string | null;
  conclusionStatus: string | null;
}): "buyer" | "seller" {
  if (order.favouredRole === "buyer" || order.favouredRole === "seller") return order.favouredRole;
  return order.conclusionStatus === "completed" ? "seller" : "buyer";
}

/** The txid of a (base64) PSBT, or null when it cannot be decoded. */
function arkTxidOf(psbtBase64: string): string | null {
  try {
    return Transaction.fromPSBT(base64.decode(psbtBase64)).id;
  } catch {
    return null;
  }
}

function parsePsbtList(value: string | null): string[] | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? (parsed as string[]) : null;
  } catch {
    return null;
  }
}

// ─── prepareDisputeSettlement ─────────────────────────────────────────────────

/**
 * Step 1 (favoured party): validate the favoured-signed ark tx against the verdict (defense in
 * depth — the arbiter re-validates independently in its browser before co-signing), persist it
 * together with the checkpoints and move the escrow to `settlementPrepared`. Signs nothing.
 */
export async function prepareDisputeSettlement(params: {
  orderId: number;
  pubkey: string;
  favouredSignedArkPsbt: string;
  checkpointPsbts: string[];
}): Promise<{ ok: true } | { error: string; status: number }> {
  const { orderId, pubkey, favouredSignedArkPsbt, checkpointPsbts } = params;

  // --- Guard: admin identity (public key only) ---
  const adminPubkey = getAdminPubkey();
  if (!adminPubkey) return { error: "Admin disabled", status: 403 };

  // --- Load order ---
  const orderRow = await db.order.findFirst({
    where: { id: orderId, OR: [{ buyerPubkey: pubkey }, { sellerPubkey: pubkey }] },
  });
  if (!orderRow) return { error: "Order not found", status: 404 };
  if (orderRow.status !== "concluded")
    return { error: "The dispute has not been concluded by the admin yet", status: 409 };
  if (!orderRow.conclusionStatus) return { error: "Dispute outcome missing", status: 409 };

  // --- Determine favoured party (admin's explicit choice, with legacy fallback) ---
  const favouredRole = resolveFavouredRole(orderRow);
  const favouredPubkey = favouredRole === "seller" ? orderRow.sellerPubkey : orderRow.buyerPubkey;
  if (pubkey !== favouredPubkey) {
    return { error: "Only the favoured party can settle", status: 403 };
  }

  // --- Load escrow ---
  if (!orderRow.escrowAddress) return { error: "Escrow missing", status: 409 };
  const escrow = await db.escrow.findUnique({ where: { address: orderRow.escrowAddress } });
  if (!escrow) return { error: "Escrow not found", status: 404 };

  // Idempotency: the arbiter already co-signed (the favoured party retried) — nothing to do.
  if (escrow.status === "settling") return { ok: true };

  if (escrow.status !== "disputed" && escrow.status !== "settlementPrepared") {
    return { error: "The escrow is not in 'disputed' status", status: 409 };
  }

  // Idempotency: the very same PSBT is already stored.
  if (
    escrow.status === "settlementPrepared" &&
    escrow.disputeFavouredSignedArkPsbt === favouredSignedArkPsbt
  ) {
    return { ok: true };
  }

  // --- Validate admin pubkey matches escrow arbiter ---
  if (escrow.arbiterPubkey && escrow.arbiterPubkey !== adminPubkey) {
    return { error: "The admin key does not match the escrow arbiter", status: 409 };
  }

  // --- Reconstruct escrow params ---
  if (!escrow.arbiterPubkey) return { error: "Arbiter missing on the escrow", status: 409 };
  const escrowParams: EscrowParams = {
    buyerPubkey: escrow.buyerPubkey,
    sellerPubkey: escrow.sellerPubkey,
    adminPubkey: escrow.arbiterPubkey,
    serverPubkey: escrow.serverPubkey,
    exitDelay: escrow.exitDelay,
    scriptNonce: escrow.nonce,
  };

  // --- Rebuild breakdown from the verdict FROZEN at conclusion (never trust client amounts, and
  // never recompute the admin share from live env: ADMIN_DISPUTE_SHARE_PERCENT may have changed
  // since the dispute was concluded, which would desync the output set from the client's — the
  // client uses the stored `order.adminDisputeShare`). Fall back to a live recompute only for
  // legacy orders concluded before the field existed. ---
  const adminDisputeShare =
    orderRow.adminDisputeShare ?? calculateAdminDisputeShare(orderRow.totalSats);

  // --- Resolve this escrow's spendable VTXOs once: outpoints bind the spend to this escrow
  // (GATE #1), and their summed value is the locked total fed to the breakdown so any overfunding
  // surplus is returned to the buyer (keeping sum(outputs) == sum(inputs)). One query → client and
  // server validation stay internally consistent. ---
  const { outpoints: allowedOutpoints, total: lockedTotal } = await getEscrowVtxoSet(
    escrow.address
  );
  if (allowedOutpoints.size === 0) {
    return { error: "No funds locked in the escrow", status: 409 };
  }

  const breakdown = computeDisputeBreakdown({
    totalSats: orderRow.totalSats,
    refundAmount: orderRow.refundAmount ?? 0,
    platformFee: orderRow.platformFee,
    adminDisputeShare,
    lockedTotal,
  });
  if (!breakdown) {
    return { error: "Invalid breakdown: cannot compute the split", status: 422 };
  }

  // --- Validate the PSBT inputs+outputs against the server-computed verdict (GATE 422) ---
  const validationError = validateDisputeSettlementTx({
    favouredSignedArkPsbt,
    checkpointPsbts,
    escrowParams,
    favouredRole,
    breakdown,
    allowedOutpoints,
  });
  if (validationError) {
    return { error: `Invalid transaction: ${validationError}`, status: 422 };
  }

  // --- Persist (no signing, no operator call). Guarded on the status so a concurrent
  // re-conclusion / co-signature cannot be overwritten; any previous co-sign data is cleared. ---
  const updated = await db.escrow.updateMany({
    where: { address: escrow.address, status: { in: ["disputed", "settlementPrepared"] } },
    data: {
      disputeFavouredSignedArkPsbt: favouredSignedArkPsbt,
      disputeCheckpointPsbts: JSON.stringify(checkpointPsbts),
      disputeServerSignedCheckpoints: null,
      disputeAdminSignedCheckpoints: null,
      disputeArkTxid: null,
      status: "settlementPrepared",
    },
  });
  if (updated.count === 0) {
    return { error: "The escrow changed in the meantime, please retry", status: 409 };
  }

  return { ok: true };
}

// ─── cosignDisputeSettlementAsAdmin ───────────────────────────────────────────

/**
 * Step 2 (arbiter): record the arbiter's client-side co-signature. The admin's browser already
 * validated the stored PSBT, signed, called `submitTx` on the operator and signed the returned
 * checkpoints; here the server only checks that the reported txid is the one of the PSBT it
 * stored (so the co-signature is bound to the transaction the favoured party prepared), persists
 * the checkpoints and moves the escrow to `settling`. The caller is already known to be the admin
 * (`signedRoute` with the `admin` signer).
 */
export async function cosignDisputeSettlementAsAdmin(params: {
  orderId: number;
  adminPubkey: string;
  disputeArkTxid: string;
  serverSignedCheckpoints: string[];
  adminSignedCheckpoints: string[];
}): Promise<{ ok: true } | { error: string; status: number }> {
  const { orderId, adminPubkey, disputeArkTxid, serverSignedCheckpoints, adminSignedCheckpoints } =
    params;

  const orderRow = await db.order.findUnique({ where: { id: orderId } });
  if (!orderRow) return { error: "Order not found", status: 404 };
  if (orderRow.status !== "concluded")
    return { error: "The dispute has not been concluded yet", status: 409 };
  if (!orderRow.escrowAddress) return { error: "Escrow missing", status: 409 };

  const escrow = await db.escrow.findUnique({ where: { address: orderRow.escrowAddress } });
  if (!escrow) return { error: "Escrow not found", status: 404 };

  // Only the escrow's own arbiter may co-sign.
  if (escrow.arbiterPubkey !== adminPubkey) {
    return { error: "You are not the arbiter of this escrow", status: 403 };
  }

  if (escrow.status !== "settlementPrepared") {
    return { error: "The settlement is not awaiting the arbiter's co-signature", status: 409 };
  }
  const storedPsbt = escrow.disputeFavouredSignedArkPsbt;
  const storedCheckpoints = parsePsbtList(escrow.disputeCheckpointPsbts);
  if (!storedPsbt || !storedCheckpoints) {
    return { error: "The prepared settlement is missing", status: 409 };
  }

  // The co-signature must be bound to the transaction the favoured party prepared.
  const storedTxid = arkTxidOf(storedPsbt);
  if (!storedTxid || storedTxid.toLowerCase() !== disputeArkTxid.toLowerCase()) {
    return {
      error: "The ark txid does not match the prepared settlement transaction",
      status: 422,
    };
  }
  if (
    serverSignedCheckpoints.length !== storedCheckpoints.length ||
    adminSignedCheckpoints.length !== storedCheckpoints.length
  ) {
    return {
      error: "The number of checkpoints does not match the prepared settlement",
      status: 422,
    };
  }

  // Guarded on status + the PSBT we validated, so a concurrent re-conclusion or re-prepare wins.
  const updated = await db.escrow.updateMany({
    where: {
      address: escrow.address,
      status: "settlementPrepared",
      disputeFavouredSignedArkPsbt: storedPsbt,
    },
    data: {
      disputeArkTxid,
      disputeServerSignedCheckpoints: JSON.stringify(serverSignedCheckpoints),
      disputeAdminSignedCheckpoints: JSON.stringify(adminSignedCheckpoints),
      status: "settling",
    },
  });
  if (updated.count === 0) {
    return { error: "The escrow changed in the meantime, please retry", status: 409 };
  }

  return { ok: true };
}

// ─── finalizeDisputeSettlement ────────────────────────────────────────────────

/**
 * Step 3 (favoured party): record the terminal state. The favoured party's browser already signed
 * the arbiter-signed checkpoints and called `finalizeTx` on the operator; this mutation only
 * advances the escrow to `completed` (seller favoured) / `refunded` (refund or partial refund),
 * stamps `settledAt`, posts the system message and closes the dispute chat.
 */
export async function finalizeDisputeSettlement(params: {
  orderId: number;
  pubkey: string;
  disputeArkTxid?: string;
}): Promise<{ ok: true } | { error: string; status: number }> {
  const { orderId, pubkey, disputeArkTxid } = params;

  // --- Load order ---
  const orderRow = await db.order.findFirst({
    where: { id: orderId, OR: [{ buyerPubkey: pubkey }, { sellerPubkey: pubkey }] },
  });
  if (!orderRow) return { error: "Order not found", status: 404 };
  if (orderRow.status !== "concluded")
    return { error: "The dispute has not been concluded by the admin yet", status: 409 };
  if (!orderRow.conclusionStatus) return { error: "Dispute outcome missing", status: 409 };

  // --- Favoured party check ---
  const favouredPubkey =
    resolveFavouredRole(orderRow) === "seller" ? orderRow.sellerPubkey : orderRow.buyerPubkey;
  if (pubkey !== favouredPubkey) {
    return { error: "Only the favoured party can finalize", status: 403 };
  }

  // --- Load escrow ---
  if (!orderRow.escrowAddress) return { error: "Escrow missing", status: 409 };
  const escrow = await db.escrow.findUnique({ where: { address: orderRow.escrowAddress } });
  if (!escrow) return { error: "Escrow not found", status: 404 };

  // Idempotency: already terminal.
  if (escrow.status === "completed" || escrow.status === "refunded") {
    return { ok: true };
  }

  if (escrow.status === "settlementPrepared") {
    return { error: "Settlement not co-signed by the arbiter yet", status: 409 };
  }
  if (escrow.status !== "settling" || !escrow.disputeArkTxid) {
    return { error: "The settlement has not been prepared yet", status: 409 };
  }
  if (disputeArkTxid && disputeArkTxid.toLowerCase() !== escrow.disputeArkTxid.toLowerCase()) {
    return { error: "The ark txid does not match the co-signed settlement", status: 422 };
  }

  // --- Advance escrow status ---
  const terminalStatus = orderRow.conclusionStatus === "completed" ? "completed" : "refunded";

  await db.$transaction(async (dbTx) => {
    await dbTx.escrow.update({
      where: { address: escrow.address },
      data: { status: terminalStatus, settledAt: new Date() },
    });

    // The escrow is now settled on Ark (terminal): this is where the dispute chat is finally
    // closed (it was kept open through the conclusion/re-conclusion window so parties and admin
    // could communicate). Post the completion notice and close it.
    if (orderRow.escrowAddress) {
      const chat = await dbTx.chat.findFirst({ where: { orderId } });
      if (chat) {
        await dbTx.message.create({
          data: {
            chatId: chat.id,
            message: "Ark settlement completed.",
            isSystem: true,
          },
        });
        await dbTx.chat.update({
          where: { id: chat.id },
          data: { status: "closed" },
        });
      }
    }
  });

  return { ok: true };
}

// ─── startDisputeExit (Stage 2 stub) ─────────────────────────────────────────

export async function startDisputeExit(
  orderId: number,
  pubkey: string
): Promise<{ error: string; status: number }> {
  void orderId;
  void pubkey;
  return { error: "Unilateral exit not available yet", status: 501 };
}
