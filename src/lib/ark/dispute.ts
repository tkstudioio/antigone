import {
  ArkAddress,
  CSVMultisigTapscript,
  Transaction,
  buildOffchainTx,
  type ArkProvider,
  type IndexerProvider,
  type Identity,
} from "@arkade-os/sdk";
import { base64, hex } from "@scure/base";

import { computeDisputeBreakdown } from "@/lib/fees";
import {
  buildEscrowVtxoScript,
  buildDisputeSellerLeafScript,
  buildDisputeBuyerLeafScript,
  deriveRecipientPkScript,
  type EscrowParams,
} from "./escrow";
import {
  decodeSettlementTx,
  assertSpendsOnlyEscrow,
  assertOutputsMatch,
  assertValueConserved,
  type ExpectedOutput,
} from "./tx-validation";

/**
 * The verdict frozen by the admin at conclusion. The builder turns it into a {@link DisputeBreakdown}
 * once it knows the locked total (sum of the escrow's spendable VTXOs), so every party derives the
 * same breakdown from the same inputs.
 */
export type DisputeVerdict = {
  totalSats: number;
  refundAmount: number;
  platformFee: number;
  adminDisputeShare: number;
};

/**
 * Client-side helpers for building, validating and signing the dispute settlement transaction via
 * the arbiter leaf (leaf 1: seller+admin+operator when the seller is favoured; leaf 2:
 * buyer+admin+operator when the buyer is favoured). The server holds NO key: every signature is
 * produced in a browser and relayed through the DB in three steps, exactly like the happy-path
 * release in `release.ts`:
 *
 *   1. favoured party prepares — {@link buildAndSignDisputeAsFavoured} builds the ark tx +
 *      checkpoints and adds the favoured party's signature to the ark tx.
 *   2. arbiter co-signs — {@link validateAndCosignDisputeAsArbiter} independently validates the
 *      transaction, adds the arbiter signature, submits to the operator (which co-signs and returns
 *      the checkpoints) and counter-signs the checkpoints.
 *   3. favoured party finalizes — {@link finalizeDisputeAsFavoured} adds the last checkpoint
 *      signature and calls `finalizeTx` on the operator.
 *
 * Isomorphic: the same gate ({@link validateDisputeSettlementTx}) runs server-side (defense in
 * depth before persisting the prepared PSBT) and in the arbiter's browser (the check that matters).
 */

export type DisputeBreakdown = {
  buyerReceives: number;
  adminReceives: number;
  sellerReceives: number;
};

/**
 * Build the output list for a dispute settlement transaction.
 * One output per breakdown component > 0 sats.
 *
 * @param escrowParams    Full escrow script params (needed for pkScript derivation).
 * @param favouredRole    Which party drives the settlement / signs the arbiter leaf ("seller" | "buyer").
 *                        Chosen explicitly by the admin; determines whose output uses their own Ark address.
 * @param breakdown       Pre-computed breakdown (buyerReceives, adminReceives, sellerReceives).
 * @param favouredArkAddress  The favoured party's own offchain Ark address.
 * @param hrp             Bech32 HRP — unused here (pkScript is HRP-independent) but kept for symmetry.
 */
export function buildDisputeOutputs(params: {
  escrowParams: EscrowParams;
  favouredRole: "buyer" | "seller";
  breakdown: DisputeBreakdown;
  favouredArkAddress: string;
  hrp?: string;
}): { amount: bigint; script: Uint8Array }[] {
  const { escrowParams, favouredRole, breakdown, favouredArkAddress } = params;
  const { buyerReceives, sellerReceives, adminReceives } = breakdown;

  const isFavouredSeller = favouredRole === "seller";
  const serverPubkey = escrowParams.serverPubkey;

  const outputs: { amount: bigint; script: Uint8Array }[] = [];

  if (isFavouredSeller) {
    // Favoured = seller: seller gets their amount via their own Ark address.
    if (sellerReceives > 0) {
      outputs.push({
        amount: BigInt(sellerReceives),
        script: ArkAddress.decode(favouredArkAddress).pkScript,
      });
    }
    // Buyer (passive recipient) — derives pkScript from buyer pubkey.
    if (buyerReceives > 0) {
      outputs.push({
        amount: BigInt(buyerReceives),
        script: deriveRecipientPkScript(
          escrowParams.buyerPubkey,
          serverPubkey,
          escrowParams.exitDelay
        ),
      });
    }
  } else {
    // Favoured = buyer: buyer gets their amount via their own Ark address.
    if (buyerReceives > 0) {
      outputs.push({
        amount: BigInt(buyerReceives),
        script: ArkAddress.decode(favouredArkAddress).pkScript,
      });
    }
    // Seller (passive recipient) — derives pkScript from seller pubkey.
    if (sellerReceives > 0) {
      outputs.push({
        amount: BigInt(sellerReceives),
        script: deriveRecipientPkScript(
          escrowParams.sellerPubkey,
          serverPubkey,
          escrowParams.exitDelay
        ),
      });
    }
  }

  // Admin always gets their share via pkScript (arbiterPubkey is the admin pubkey).
  if (adminReceives > 0) {
    outputs.push({
      amount: BigInt(adminReceives),
      script: deriveRecipientPkScript(
        escrowParams.adminPubkey,
        serverPubkey,
        escrowParams.exitDelay
      ),
    });
  }

  return outputs;
}

/**
 * The set of outputs a dispute settlement must pay, derived from the breakdown. Order-independent.
 * The favoured party's own output has a free pkScript (`""`: their own Ark address, which the
 * validator cannot know); every other recipient's pkScript is bound to their pubkey.
 */
export function buildExpectedDisputeOutputs(params: {
  escrowParams: EscrowParams;
  favouredRole: "buyer" | "seller";
  breakdown: DisputeBreakdown;
}): ExpectedOutput[] {
  const { escrowParams, favouredRole, breakdown } = params;
  const { serverPubkey, exitDelay } = escrowParams;
  const pkScriptHexFor = (pubkey: string) =>
    hex.encode(deriveRecipientPkScript(pubkey, serverPubkey, exitDelay));

  const expected: ExpectedOutput[] = [];

  if (favouredRole === "seller") {
    // Favoured = seller: seller output pkScript is free (their own offchain Ark address).
    if (breakdown.sellerReceives > 0) {
      expected.push({ amount: BigInt(breakdown.sellerReceives), pkScriptHex: "" });
    }
    if (breakdown.buyerReceives > 0) {
      expected.push({
        amount: BigInt(breakdown.buyerReceives),
        pkScriptHex: pkScriptHexFor(escrowParams.buyerPubkey),
      });
    }
  } else {
    // Favoured = buyer: buyer output pkScript is free.
    if (breakdown.buyerReceives > 0) {
      expected.push({ amount: BigInt(breakdown.buyerReceives), pkScriptHex: "" });
    }
    if (breakdown.sellerReceives > 0) {
      expected.push({
        amount: BigInt(breakdown.sellerReceives),
        pkScriptHex: pkScriptHexFor(escrowParams.sellerPubkey),
      });
    }
  }

  if (breakdown.adminReceives > 0) {
    expected.push({
      amount: BigInt(breakdown.adminReceives),
      pkScriptHex: pkScriptHexFor(escrowParams.adminPubkey),
    });
  }

  return expected;
}

/**
 * Validate the favoured party's signed dispute settlement against the verdict. Returns an error
 * string if any gate fails, `null` when the transaction is acceptable.
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
 * the input binding (#1/#2) + the output gate (#3) + the arbiter signature (the operator cannot
 * co-sign without it) already make any tampered tx either invalid or harmless.
 */
export function validateDisputeSettlementTx(params: {
  favouredSignedArkPsbt: string;
  checkpointPsbts: string[];
  escrowParams: EscrowParams;
  favouredRole: "buyer" | "seller";
  breakdown: DisputeBreakdown;
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

  // Ensure the expected spending leaf exists in the tree (build check): inconsistent escrow params
  // make the leaf builder throw before anything is signed.
  const leafCheck =
    favouredRole === "seller"
      ? buildDisputeSellerLeafScript(escrowParams)
      : buildDisputeBuyerLeafScript(escrowParams);
  void leafCheck;

  // Decode the ark tx + checkpoints with the SDK (btc-signer stores txids in display order, matching
  // the indexer outpoints in `allowedOutpoints`).
  const decoded = decodeSettlementTx(favouredSignedArkPsbt, checkpointPsbts);
  if ("error" in decoded) return decoded.error;
  const { arkTx, checkpointTxs } = decoded;

  // GATE #1 + #2 — inputs bound to this escrow, ark tx bound to the checkpoints.
  const bindingError = assertSpendsOnlyEscrow(arkTx, checkpointTxs, allowedOutpoints);
  if (bindingError) return bindingError;

  // GATE #3 — outputs match the verdict (order-independent; the P2A anchor is skipped by the helper).
  const outputsError = assertOutputsMatch(
    arkTx,
    buildExpectedDisputeOutputs({ escrowParams, favouredRole, breakdown })
  );
  if (outputsError) return outputsError;

  // GATE #4 — value conservation: the breakdown already folds any overfunding surplus into the
  // buyer's share, so the total equals the locked amount being spent.
  const expectedTotal = BigInt(
    breakdown.buyerReceives + breakdown.sellerReceives + breakdown.adminReceives
  );
  return assertValueConserved(arkTx, expectedTotal);
}

export type PreparedDisputeSettlement = {
  /** Ark tx PSBT (base64) carrying the favoured party's signature. */
  favouredSignedArkPsbt: string;
  /** Unsigned checkpoint PSBTs (base64), one per input, as produced by `buildOffchainTx`. */
  checkpointPsbts: string[];
};

/**
 * Step 1 (favoured party): build and sign the dispute settlement transaction.
 * Mirrors `buildAndSignReleaseAsSeller` but targets leaf 1 or 2 depending on `favouredRole`.
 *
 * The breakdown is computed HERE from the supplied `verdict` plus the locked total (sum of the
 * escrow's spendable VTXOs that are about to be spent), so any overfunding surplus is returned to
 * the buyer and `sum(outputs) == sum(inputs)` holds (Arkade offchain fee = 0). The server and the
 * arbiter re-derive the same breakdown from the same VTXO set when validating.
 */
export async function buildAndSignDisputeAsFavoured(params: {
  escrowParams: EscrowParams;
  favouredRole: "buyer" | "seller";
  verdict: DisputeVerdict;
  favouredArkAddress: string;
  identity: Identity;
  arkProvider: ArkProvider;
  indexerProvider: IndexerProvider;
}): Promise<PreparedDisputeSettlement> {
  const {
    escrowParams,
    favouredRole,
    verdict,
    favouredArkAddress,
    identity,
    arkProvider,
    indexerProvider,
  } = params;

  const escrowScript = buildEscrowVtxoScript(escrowParams);

  // Select the correct arbitration leaf based on the admin's chosen favoured party.
  const leafBytes =
    favouredRole === "seller"
      ? buildDisputeSellerLeafScript(escrowParams)
      : buildDisputeBuyerLeafScript(escrowParams);
  const tapLeafScript = escrowScript.findLeaf(hex.encode(leafBytes));
  const tapTree = escrowScript.encode();

  const { vtxos } = await indexerProvider.getVtxos({
    scripts: [hex.encode(escrowScript.pkScript)],
    spendableOnly: true,
  });
  if (vtxos.length === 0) throw new Error("No funds locked in the escrow");

  const inputs = vtxos.map((v) => ({
    txid: v.txid,
    vout: v.vout,
    value: v.value,
    tapLeafScript,
    tapTree,
  }));

  // Locked total = sum of the VTXOs we are about to spend; drives the surplus allocation so the
  // outputs sum to the inputs.
  const lockedTotal = vtxos.reduce((sum, v) => sum + v.value, 0);
  const breakdown = computeDisputeBreakdown({ ...verdict, lockedTotal });
  if (!breakdown) throw new Error("Invalid breakdown: refund + fees exceed the total");

  const info = await arkProvider.getInfo();
  const serverUnrollScript = CSVMultisigTapscript.decode(hex.decode(info.checkpointTapscript));

  const outputs = buildDisputeOutputs({
    escrowParams,
    favouredRole,
    breakdown,
    favouredArkAddress,
  });

  const { arkTx, checkpoints } = buildOffchainTx(inputs, outputs, serverUnrollScript);

  const signedArkTx = await identity.sign(Transaction.fromPSBT(arkTx.toPSBT()));

  return {
    favouredSignedArkPsbt: base64.encode(signedArkTx.toPSBT()),
    checkpointPsbts: checkpoints.map((c) => base64.encode(c.toPSBT())),
  };
}

export type CosignedDispute = {
  /** Ark txid returned by the operator's `submitTx`. */
  disputeArkTxid: string;
  /** Checkpoints as co-signed by the operator. */
  serverSignedCheckpoints: string[];
  /** The same checkpoints with the arbiter's signature added. */
  adminSignedCheckpoints: string[];
};

/**
 * Step 2 (arbiter): independently validate the favoured party's settlement, add the arbiter
 * signature, submit to the operator and counter-sign the returned checkpoints.
 *
 * Nothing the server says is trusted beyond the verdict figures (phase 4 makes those verifiable):
 *   - the escrow script is re-derived from `escrowParams` and must match the escrow address the
 *     buyer paid (so the params — hence the leaves and the arbiter key — are the real ones);
 *   - the arbiter pubkey inside the escrow must be OUR own key;
 *   - the spendable VTXOs are read from the Ark indexer (not from our API) and bind the inputs;
 *   - the breakdown is recomputed from the verdict + locked total, and the shared gates require the
 *     outputs to match it and the value to be conserved.
 * Any failure throws BEFORE a signature is produced or anything is sent to the operator.
 */
export async function validateAndCosignDisputeAsArbiter(params: {
  favouredSignedArkPsbt: string;
  checkpointPsbts: string[];
  escrowParams: EscrowParams;
  /** The escrow address stored for the order; the re-derived script must produce its pkScript. */
  escrowAddress: string;
  favouredRole: "buyer" | "seller";
  verdict: DisputeVerdict;
  /** The arbiter's own 33-byte compressed pubkey (hex). */
  ownPubkey: string;
  identity: Identity;
  arkProvider: ArkProvider;
  indexerProvider: IndexerProvider;
}): Promise<CosignedDispute> {
  const {
    favouredSignedArkPsbt,
    checkpointPsbts,
    escrowParams,
    escrowAddress,
    favouredRole,
    verdict,
    ownPubkey,
    identity,
    arkProvider,
    indexerProvider,
  } = params;

  // 1. The arbiter key in the escrow must be ours.
  if (escrowParams.adminPubkey.toLowerCase() !== ownPubkey.toLowerCase()) {
    throw new Error("Invalid escrow: the arbiter key is not yours");
  }

  // 2. The re-derived escrow script must produce the address the buyer paid.
  const escrowScript = buildEscrowVtxoScript(escrowParams);
  const storedPkScript = hex.encode(ArkAddress.decode(escrowAddress).pkScript);
  if (hex.encode(escrowScript.pkScript) !== storedPkScript) {
    throw new Error("Invalid escrow: the escrow parameters do not match the escrow address");
  }

  // 3. Spendable VTXOs straight from the indexer.
  const { vtxos } = await indexerProvider.getVtxos({
    scripts: [hex.encode(escrowScript.pkScript)],
    spendableOnly: true,
  });
  if (vtxos.length === 0) throw new Error("No funds locked in the escrow");
  const allowedOutpoints = new Set(vtxos.map((v) => `${v.txid}:${v.vout}`));
  const lockedTotal = vtxos.reduce((sum, v) => sum + v.value, 0);

  // 4. Breakdown from the verdict, then the shared gates.
  const breakdown = computeDisputeBreakdown({ ...verdict, lockedTotal });
  if (!breakdown) throw new Error("Invalid breakdown: refund + fees exceed the total");

  const validationError = validateDisputeSettlementTx({
    favouredSignedArkPsbt,
    checkpointPsbts,
    escrowParams,
    favouredRole,
    breakdown,
    allowedOutpoints,
  });
  if (validationError) throw new Error(`Invalid transaction: ${validationError}`);

  // 5. Sign (the favoured party already signed), submit — the operator adds the third signature and
  // returns the checkpoints — then counter-sign each checkpoint.
  const signedByArbiter = await identity.sign(
    Transaction.fromPSBT(base64.decode(favouredSignedArkPsbt))
  );
  const { arkTxid, signedCheckpointTxs } = await arkProvider.submitTx(
    base64.encode(signedByArbiter.toPSBT()),
    checkpointPsbts
  );
  const adminSignedCheckpoints = await Promise.all(
    signedCheckpointTxs.map(async (cp) => {
      const signed = await identity.sign(Transaction.fromPSBT(base64.decode(cp)), [0]);
      return base64.encode(signed.toPSBT());
    })
  );

  return {
    disputeArkTxid: arkTxid,
    serverSignedCheckpoints: signedCheckpointTxs,
    adminSignedCheckpoints,
  };
}

/**
 * Step 3 (favoured party): add the last checkpoint signature to the arbiter-signed checkpoints and
 * finalize on the operator, moving the funds. Mirror of `finalizeReleaseAsSeller`.
 */
export async function finalizeDisputeAsFavoured(params: {
  disputeArkTxid: string;
  adminSignedCheckpoints: string[];
  identity: Identity;
  arkProvider: ArkProvider;
}): Promise<void> {
  const { disputeArkTxid, adminSignedCheckpoints, identity, arkProvider } = params;

  const fullySignedCheckpoints = await Promise.all(
    adminSignedCheckpoints.map(async (cp) => {
      const signed = await identity.sign(Transaction.fromPSBT(base64.decode(cp)), [0]);
      return base64.encode(signed.toPSBT());
    })
  );

  await arkProvider.finalizeTx(disputeArkTxid, fullySignedCheckpoints);
}
