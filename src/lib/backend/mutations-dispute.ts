import "server-only";

import { RestArkProvider, SingleKey } from "@arkade-os/sdk";
import { hex } from "@scure/base";

import { db } from "@/db";
import { getAdminPrivateKey, getAdminPubkey } from "@/lib/backend/admin-key";
import { ARK_SERVER_URL } from "@/lib/ark";
import { calculateAdminDisputeShare, computeDisputeBreakdown } from "@/lib/fees";
import {
  buildDisputeSellerLeafScript,
  buildDisputeBuyerLeafScript,
  deriveRecipientPkScript,
} from "@/lib/ark/escrow";
import { submitDisputeAsAdmin, finalizeDispute } from "@/lib/ark/dispute-server";
import { getEscrowVtxoSet } from "@/lib/ark/funding";
import {
  decodeSettlementTx,
  assertSpendsOnlyEscrow,
  assertOutputsMatch,
  assertValueConserved,
  type ExpectedOutput,
} from "@/lib/ark/tx-validation";
import type { EscrowParams } from "@/lib/ark/escrow";

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

// ─── Output validation ────────────────────────────────────────────────────────

/**
 * Validate the favoured party's signed dispute settlement against the server-computed verdict.
 * Returns an error string (422) if any check fails.
 *
 * Arkade offchain txs come in two layers: the `checkpointPsbts` spend the escrow's real VTXOs, and
 * the `favouredSignedArkPsbt` (the ark tx) spends the checkpoint outputs — so the ark tx's inputs are
 * checkpoint txids (computed locally, not yet on-chain), NOT the escrow VTXOs. Validation therefore
 * checks the two layers separately:
 *
 *   1. INPUTS: every checkpoint input spends a spendable VTXO of THIS escrow (via `allowedOutpoints`).
 *      Security-critical: without it, a favoured party in dispute A could settle by spending a
 *      DIFFERENT escrow's VTXOs (same admin/arbiter, same parties → byte-identical arbiter leaf) with
 *      outputs matching A's verdict, draining the other escrow. The per-order nonce makes each escrow
 *      address unique, so binding the checkpoint inputs to this escrow's outpoints closes that vector.
 *   2. BINDING: every ark tx input spends one of the supplied checkpoints, so the validated outputs
 *      cannot be paired with checkpoints from another escrow.
 *   3. OUTPUTS: the ark tx pays exactly the right set with correct amounts and pkScripts; no extras.
 *   4. Value conservation (sum outputs == verdict total; Arkade offchain fee = 0 per spec).
 *
 * Note: full witness-leaf assertion (which tapleaf is spent) is defense-in-depth and not parsed here;
 * the input binding (#1/#2) + the output gate (#3) + the admin signature (the operator cannot co-sign
 * without it) already make any tampered tx either invalid or harmless.
 */
function validateDisputeTxOutputs(params: {
  favouredSignedArkPsbt: string;
  checkpointPsbts: string[];
  escrowParams: EscrowParams;
  favouredRole: "buyer" | "seller";
  breakdown: { buyerReceives: number; sellerReceives: number; adminReceives: number };
  allowedOutpoints: Set<string>;
}): string | null {
  const {
    favouredSignedArkPsbt,
    checkpointPsbts,
    escrowParams,
    favouredRole,
    breakdown,
    allowedOutpoints,
  } = params;

  // Ensure the expected spending leaf exists in the tree (build check).
  // If escrowParams are inconsistent, buildDisputeXLeafScript will throw before we sign.
  const _leafCheck =
    favouredRole === "seller"
      ? buildDisputeSellerLeafScript(escrowParams)
      : buildDisputeBuyerLeafScript(escrowParams);
  void _leafCheck;

  const isFavouredSeller = favouredRole === "seller";
  const serverPubkey = escrowParams.serverPubkey;

  // Build the expected output set (order-independent matching).
  const expectedOutputs: ExpectedOutput[] = [];

  if (isFavouredSeller) {
    // Favoured = seller: seller output pkScript is free (their own offchain Ark address).
    if (breakdown.sellerReceives > 0) {
      expectedOutputs.push({ amount: BigInt(breakdown.sellerReceives), pkScriptHex: "" });
    }
    if (breakdown.buyerReceives > 0) {
      expectedOutputs.push({
        amount: BigInt(breakdown.buyerReceives),
        pkScriptHex: hex.encode(
          deriveRecipientPkScript(escrowParams.buyerPubkey, serverPubkey, escrowParams.exitDelay)
        ),
      });
    }
  } else {
    // Favoured = buyer: buyer output pkScript is free.
    if (breakdown.buyerReceives > 0) {
      expectedOutputs.push({ amount: BigInt(breakdown.buyerReceives), pkScriptHex: "" });
    }
    if (breakdown.sellerReceives > 0) {
      expectedOutputs.push({
        amount: BigInt(breakdown.sellerReceives),
        pkScriptHex: hex.encode(
          deriveRecipientPkScript(escrowParams.sellerPubkey, serverPubkey, escrowParams.exitDelay)
        ),
      });
    }
  }

  if (breakdown.adminReceives > 0) {
    expectedOutputs.push({
      amount: BigInt(breakdown.adminReceives),
      pkScriptHex: hex.encode(
        deriveRecipientPkScript(escrowParams.adminPubkey, serverPubkey, escrowParams.exitDelay)
      ),
    });
  }

  // Decode the ark tx + checkpoints with the SDK (btc-signer stores txids in display order, matching
  // the indexer outpoints in `allowedOutpoints`).
  const decoded = decodeSettlementTx(favouredSignedArkPsbt, checkpointPsbts);
  if ("error" in decoded) return decoded.error;
  const { arkTx, checkpointTxs } = decoded;

  // GATE #1 + #2 — every checkpoint input spends ONLY this escrow's VTXOs, and every ark tx input
  // spends one of those checkpoints. Without #1 a favoured party in dispute A could settle by
  // spending a DIFFERENT escrow's VTXOs (same parties → byte-identical arbiter leaf); the per-order
  // nonce makes each escrow address unique, so binding the inputs here closes that vector.
  const bindingError = assertSpendsOnlyEscrow(arkTx, checkpointTxs, allowedOutpoints);
  if (bindingError) return bindingError;

  // GATE #3 — the ark tx outputs must match the server-computed verdict (order-independent; the
  // mandatory P2A anchor is skipped inside the helper).
  const outputsError = assertOutputsMatch(arkTx, expectedOutputs);
  if (outputsError) return outputsError;

  // GATE #4 — value conservation: sum(outputs) == verdict total (Arkade offchain fee = 0). The
  // breakdown already folds any overfunding surplus into the buyer's share, so the total equals the
  // locked amount being spent.
  const expectedTotal = BigInt(
    breakdown.buyerReceives + breakdown.sellerReceives + breakdown.adminReceives
  );
  const valueError = assertValueConserved(arkTx, expectedTotal);
  if (valueError) return valueError;

  return null; // all checks passed
}

// ─── prepareDisputeSettlement ─────────────────────────────────────────────────

export async function prepareDisputeSettlement(params: {
  orderId: number;
  pubkey: string;
  favouredSignedArkPsbt: string;
  checkpointPsbts: string[];
}): Promise<
  | { ok: true; disputeArkTxid: string; adminSignedCheckpoints: string[] }
  | { error: string; status: number }
> {
  const { orderId, pubkey, favouredSignedArkPsbt, checkpointPsbts } = params;

  // --- Guard: admin key ---
  const adminPrivkey = getAdminPrivateKey();
  if (!adminPrivkey) return { error: "Admin disabilitato", status: 403 };
  const adminPubkey = getAdminPubkey()!;

  // --- Load order ---
  const orderRow = await db.order.findFirst({
    where: { id: orderId, OR: [{ buyerPubkey: pubkey }, { sellerPubkey: pubkey }] },
    include: { chat: { select: { id: true } } },
  });
  if (!orderRow) return { error: "Ordine non trovato", status: 404 };
  if (orderRow.status !== "concluded")
    return { error: "La disputa non è ancora stata conclusa dall'admin", status: 409 };
  if (!orderRow.conclusionStatus) return { error: "Esito disputa mancante", status: 409 };

  // --- Determine favoured party (admin's explicit choice, with legacy fallback) ---
  const favouredRole = resolveFavouredRole(orderRow);
  const favouredPubkey = favouredRole === "seller" ? orderRow.sellerPubkey : orderRow.buyerPubkey;
  if (pubkey !== favouredPubkey) {
    return { error: "Solo la parte favorita può liquidare", status: 403 };
  }

  // --- Load escrow ---
  if (!orderRow.escrowAddress) return { error: "Escrow mancante", status: 409 };
  const escrow = await db.escrow.findUnique({ where: { address: orderRow.escrowAddress } });
  if (!escrow) return { error: "Escrow non trovato", status: 404 };

  // Idempotency: already settling — return existing txid.
  if (escrow.status === "settling" && escrow.disputeArkTxid) {
    const adminSignedCheckpoints = escrow.disputeAdminSignedCheckpoints
      ? (JSON.parse(escrow.disputeAdminSignedCheckpoints) as string[])
      : [];
    return { ok: true, disputeArkTxid: escrow.disputeArkTxid, adminSignedCheckpoints };
  }

  if (escrow.status !== "disputed") {
    return { error: "L'escrow non è in stato 'disputed'", status: 409 };
  }

  // --- Validate admin pubkey matches escrow arbiter ---
  if (escrow.arbiterPubkey && escrow.arbiterPubkey !== adminPubkey) {
    return { error: "La chiave admin non corrisponde all'arbitro dell'escrow", status: 409 };
  }

  // --- Reconstruct escrow params ---
  if (!escrow.arbiterPubkey) return { error: "Arbitro mancante sull'escrow", status: 409 };
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
    return { error: "Nessun fondo bloccato nell'escrow", status: 409 };
  }

  const breakdown = computeDisputeBreakdown({
    totalSats: orderRow.totalSats,
    refundAmount: orderRow.refundAmount ?? 0,
    platformFee: orderRow.platformFee,
    adminDisputeShare,
    lockedTotal,
  });
  if (!breakdown) {
    return { error: "Breakdown non valido: impossibile calcolare la ripartizione", status: 422 };
  }

  // --- Validate the PSBT inputs+outputs against the server-computed verdict (GATE) ---
  const validationError = validateDisputeTxOutputs({
    favouredSignedArkPsbt,
    checkpointPsbts,
    escrowParams,
    favouredRole,
    breakdown,
    allowedOutpoints,
  });
  if (validationError) {
    return { error: `Transazione non valida: ${validationError}`, status: 422 };
  }

  // --- Admin co-signs and submits to operator ---
  const adminIdentity = SingleKey.fromHex(adminPrivkey);
  const arkProvider = new RestArkProvider(ARK_SERVER_URL);

  let submitResult: Awaited<ReturnType<typeof submitDisputeAsAdmin>>;
  try {
    submitResult = await submitDisputeAsAdmin({
      favouredSignedArkPsbt,
      checkpointPsbts,
      adminIdentity,
      arkProvider,
    });
  } catch (err) {
    return {
      error: `Errore durante il submit all'operatore: ${err instanceof Error ? err.message : String(err)}`,
      status: 502,
    };
  }

  const { disputeArkTxid, serverSignedCheckpoints, adminSignedCheckpoints } = submitResult;

  // --- Persist in DB ---
  await db.escrow.update({
    where: { address: escrow.address },
    data: {
      disputeFavouredSignedArkPsbt: favouredSignedArkPsbt,
      disputeCheckpointPsbts: JSON.stringify(checkpointPsbts),
      disputeServerSignedCheckpoints: JSON.stringify(serverSignedCheckpoints),
      disputeAdminSignedCheckpoints: JSON.stringify(adminSignedCheckpoints),
      disputeArkTxid,
      status: "settling",
    },
  });

  return { ok: true, disputeArkTxid, adminSignedCheckpoints };
}

// ─── finalizeDisputeSettlement ────────────────────────────────────────────────

export async function finalizeDisputeSettlement(params: {
  orderId: number;
  pubkey: string;
  fullySignedCheckpoints: string[];
}): Promise<{ ok: true } | { error: string; status: number }> {
  const { orderId, pubkey, fullySignedCheckpoints } = params;

  // --- Load order ---
  const orderRow = await db.order.findFirst({
    where: { id: orderId, OR: [{ buyerPubkey: pubkey }, { sellerPubkey: pubkey }] },
  });
  if (!orderRow) return { error: "Ordine non trovato", status: 404 };
  if (orderRow.status !== "concluded")
    return { error: "La disputa non è ancora stata conclusa dall'admin", status: 409 };
  if (!orderRow.conclusionStatus) return { error: "Esito disputa mancante", status: 409 };

  // --- Favoured party check ---
  const favouredPubkey =
    resolveFavouredRole(orderRow) === "seller" ? orderRow.sellerPubkey : orderRow.buyerPubkey;
  if (pubkey !== favouredPubkey) {
    return { error: "Solo la parte favorita può finalizzare", status: 403 };
  }

  // --- Load escrow ---
  if (!orderRow.escrowAddress) return { error: "Escrow mancante", status: 409 };
  const escrow = await db.escrow.findUnique({ where: { address: orderRow.escrowAddress } });
  if (!escrow) return { error: "Escrow non trovato", status: 404 };

  // Idempotency: already terminal.
  if (escrow.status === "completed" || escrow.status === "refunded") {
    return { ok: true };
  }

  if (escrow.status !== "settling" || !escrow.disputeArkTxid) {
    return { error: "Il settlement non è ancora stato preparato", status: 409 };
  }

  // --- finalizeTx with operator ---
  const arkProvider = new RestArkProvider(ARK_SERVER_URL);
  try {
    await finalizeDispute({
      disputeArkTxid: escrow.disputeArkTxid,
      fullySignedCheckpoints,
      arkProvider,
    });
  } catch (err) {
    return {
      error: `Errore durante la finalizzazione: ${err instanceof Error ? err.message : String(err)}`,
      status: 502,
    };
  }

  // --- Advance escrow status ---
  const terminalStatus = orderRow.conclusionStatus === "completed" ? "completed" : "refunded";

  await db.$transaction(async (dbTx) => {
    await dbTx.escrow.update({
      where: { address: escrow.address },
      data: { status: terminalStatus, settledAt: new Date() },
    });

    // The escrow is now settled on-chain (terminal): this is where the dispute chat is finally
    // closed (it was kept open through the conclusion/re-conclusion window so parties and admin
    // could communicate). Post the completion notice and close it.
    if (orderRow.escrowAddress) {
      const chat = await dbTx.chat.findFirst({ where: { orderId } });
      if (chat) {
        await dbTx.message.create({
          data: {
            chatId: chat.id,
            message: "Liquidazione on-chain completata.",
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
  return { error: "Exit unilaterale non ancora disponibile", status: 501 };
}
