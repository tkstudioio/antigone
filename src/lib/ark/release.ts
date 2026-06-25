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

import {
  buildEscrowVtxoScript,
  buildCollaborativeLeafScript,
  deriveRecipientPkScript,
  type EscrowParams,
} from "./escrow";
import {
  decodeSettlementTx,
  assertSpendsOnlyEscrow,
  assertOutputsMatch,
  assertValueConserved,
} from "./tx-validation";

/**
 * Client-side helpers that drive the happy-path collaborative release of an escrow VTXO
 * (leaf 0: buyer + seller + operator). Buyer and seller keys live only in their browsers and are
 * never online together, so the spend is relayed through the DB in three signed steps:
 *
 * The release splits the locked funds into TWO outputs: the platform fee (`platformFee`) goes to the
 * admin and the remainder goes to the seller. The buyer funded `goods + fee`, so the seller nets the
 * goods price and the admin keeps the 1% surcharge — the same fee the dispute path also collects.
 *
 *   1. seller arms it  — {@link buildAndSignReleaseAsSeller} builds the ark tx + checkpoints and
 *      adds the seller signature to the ark tx.
 *   2. buyer collaborates — {@link submitAndSignAsBuyer} adds the buyer signature, submits to the
 *      operator (which co-signs and returns the checkpoints), then countersigns the checkpoints.
 *   3. seller finalizes — {@link finalizeReleaseAsSeller} adds the last checkpoint signature and
 *      finalizes, releasing the funds to the seller's address.
 *
 * The matching server mutations (`prepareRelease`/`collaborateRelease`/`finalizeRelease`) only
 * persist the relayed PSBTs and advance the escrow status.
 */

export type PreparedRelease = {
  /** Ark tx PSBT (base64) carrying the seller signature. */
  sellerSignedCollabPsbt: string;
  /** Unsigned checkpoint PSBTs (base64), one per input, as produced by `buildOffchainTx`. */
  checkpointPsbts: string[];
};

export type CollaboratedRelease = {
  collabArkTxid: string;
  serverSignedCheckpoints: string[];
  buyerSignedCheckpoints: string[];
};

/**
 * Step 1 (seller): build the release tx paying the escrow funds out — `platformFee` to the admin and
 * the remainder to the seller — and sign the ark tx.
 */
export async function buildAndSignReleaseAsSeller(params: {
  escrowParams: EscrowParams;
  sellerArkAddress: string;
  /** Platform fee (sats) carved off to the admin; the seller receives the locked total minus this. */
  platformFee: number;
  identity: Identity;
  arkProvider: ArkProvider;
  indexerProvider: IndexerProvider;
}): Promise<PreparedRelease> {
  const { escrowParams, sellerArkAddress, platformFee, identity, arkProvider, indexerProvider } =
    params;

  const escrowScript = buildEscrowVtxoScript(escrowParams);
  const tapLeafScript = escrowScript.findLeaf(
    hex.encode(buildCollaborativeLeafScript(escrowParams))
  );
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
  const total = vtxos.reduce((sum, v) => sum + v.value, 0);

  const sellerReceives = total - platformFee;
  if (sellerReceives < 0) throw new Error("Platform fee greater than the locked funds");

  const info = await arkProvider.getInfo();
  const serverUnrollScript = CSVMultisigTapscript.decode(hex.decode(info.checkpointTapscript));

  // Two outputs: seller gets the locked total minus the fee, admin gets the platform fee.
  const outputs = [
    { amount: BigInt(sellerReceives), script: ArkAddress.decode(sellerArkAddress).pkScript },
  ];
  if (platformFee > 0) {
    outputs.push({
      amount: BigInt(platformFee),
      script: deriveRecipientPkScript(
        escrowParams.adminPubkey,
        escrowParams.serverPubkey,
        escrowParams.exitDelay
      ),
    });
  }

  const { arkTx, checkpoints } = buildOffchainTx(inputs, outputs, serverUnrollScript);

  const signedArkTx = await identity.sign(Transaction.fromPSBT(arkTx.toPSBT()));

  return {
    sellerSignedCollabPsbt: base64.encode(signedArkTx.toPSBT()),
    checkpointPsbts: checkpoints.map((c) => base64.encode(c.toPSBT())),
  };
}

/**
 * Step 2 (buyer): verify the seller's release tx, add the buyer signature, submit to the operator,
 * countersign the checkpoints.
 *
 * Before co-signing, the buyer re-derives this escrow's spendable VTXOs and asserts that the
 * seller-built PSBT (a) spends ONLY those VTXOs and (b) pays out the locked total split into the
 * platform fee (to the admin's pkScript) and the remainder (to the seller) — mirroring the dispute
 * settlement gate. This stops the buyer from blindly signing a tx that spends a different escrow or
 * splits/short-changes the amount. The seller's recipient pkScript is NOT bound (the buyer needn't
 * know the seller's exact Arkade address); the admin's IS bound, so the fee can't be redirected.
 */
export async function submitAndSignAsBuyer(params: {
  sellerSignedCollabPsbt: string;
  checkpointPsbts: string[];
  escrowParams: EscrowParams;
  /** Platform fee (sats) that must be paid to the admin in the release outputs. */
  platformFee: number;
  identity: Identity;
  arkProvider: ArkProvider;
  indexerProvider: IndexerProvider;
}): Promise<CollaboratedRelease> {
  const {
    sellerSignedCollabPsbt,
    checkpointPsbts,
    escrowParams,
    platformFee,
    identity,
    arkProvider,
    indexerProvider,
  } = params;

  // Re-derive this escrow's spendable VTXOs: their outpoints bind the spend, their summed value is
  // the exact amount that must be paid out.
  const escrowScript = buildEscrowVtxoScript(escrowParams);
  const { vtxos } = await indexerProvider.getVtxos({
    scripts: [hex.encode(escrowScript.pkScript)],
    spendableOnly: true,
  });
  if (vtxos.length === 0) throw new Error("No funds locked in the escrow");
  const allowedOutpoints = new Set(vtxos.map((v) => `${v.txid}:${v.vout}`));
  const total = vtxos.reduce((sum, v) => sum + v.value, 0);

  const decoded = decodeSettlementTx(sellerSignedCollabPsbt, checkpointPsbts);
  if ("error" in decoded) throw new Error(`Invalid release: ${decoded.error}`);
  const bindingError = assertSpendsOnlyEscrow(
    decoded.arkTx,
    decoded.checkpointTxs,
    allowedOutpoints
  );
  if (bindingError) throw new Error(`Invalid release: ${bindingError}`);
  // Payout of the locked total split into: platform fee → admin (pkScript bound), remainder → seller
  // (recipient pkScript intentionally free, since the buyer is the one choosing to release).
  const adminPkScriptHex = hex.encode(
    deriveRecipientPkScript(
      escrowParams.adminPubkey,
      escrowParams.serverPubkey,
      escrowParams.exitDelay
    )
  );
  const expectedOutputs = [{ amount: BigInt(total - platformFee), pkScriptHex: "" }];
  if (platformFee > 0) {
    expectedOutputs.push({ amount: BigInt(platformFee), pkScriptHex: adminPkScriptHex });
  }
  const outputsError = assertOutputsMatch(decoded.arkTx, expectedOutputs);
  if (outputsError) throw new Error(`Invalid release: ${outputsError}`);
  const valueError = assertValueConserved(decoded.arkTx, BigInt(total));
  if (valueError) throw new Error(`Invalid release: ${valueError}`);

  const signedByBoth = await identity.sign(
    Transaction.fromPSBT(base64.decode(sellerSignedCollabPsbt))
  );

  const { arkTxid, signedCheckpointTxs } = await arkProvider.submitTx(
    base64.encode(signedByBoth.toPSBT()),
    checkpointPsbts
  );

  const buyerSignedCheckpoints = await Promise.all(
    signedCheckpointTxs.map(async (cp) => {
      const signed = await identity.sign(Transaction.fromPSBT(base64.decode(cp)), [0]);
      return base64.encode(signed.toPSBT());
    })
  );

  return {
    collabArkTxid: arkTxid,
    serverSignedCheckpoints: signedCheckpointTxs,
    buyerSignedCheckpoints,
  };
}

/** Step 3 (seller): add the final checkpoint signature and finalize, releasing the funds. */
export async function finalizeReleaseAsSeller(params: {
  collabArkTxid: string;
  buyerSignedCheckpoints: string[];
  identity: Identity;
  arkProvider: ArkProvider;
}): Promise<void> {
  const { collabArkTxid, buyerSignedCheckpoints, identity, arkProvider } = params;

  const finalCheckpoints = await Promise.all(
    buyerSignedCheckpoints.map(async (cp) => {
      const signed = await identity.sign(Transaction.fromPSBT(base64.decode(cp)), [0]);
      return base64.encode(signed.toPSBT());
    })
  );

  await arkProvider.finalizeTx(collabArkTxid, finalCheckpoints);
}
