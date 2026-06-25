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

/**
 * The verdict frozen by the admin at conclusion. The builder turns it into a {@link DisputeBreakdown}
 * once it knows the locked total (sum of the escrow's spendable VTXOs), so client and server derive
 * the same breakdown from the same inputs.
 */
export type DisputeVerdict = {
  totalSats: number;
  refundAmount: number;
  platformFee: number;
  adminDisputeShare: number;
};

/**
 * Client-side helpers for building and signing the dispute settlement transaction via
 * the arbiter leaf (leaf 1: seller+admin+operator for "completed"; leaf 2: buyer+admin+operator
 * for any buyer-favoured outcome). This is a 2-step relay (prepare → finalize) because admin
 * signs server-side.
 *
 * Mirrors the structure of `release.ts` but targets the dispute spending paths.
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

export type PreparedDisputeSettlement = {
  /** Ark tx PSBT (base64) carrying the favoured party's signature. */
  favouredSignedArkPsbt: string;
  /** Unsigned checkpoint PSBTs (base64), one per input, as produced by `buildOffchainTx`. */
  checkpointPsbts: string[];
};

/**
 * Build and sign the dispute settlement transaction as the favoured party.
 * Mirrors `buildAndSignReleaseAsSeller` but targets leaf 1 or 2 depending on `favouredRole`.
 *
 * The breakdown is computed HERE from the supplied `verdict` plus the locked total (sum of the
 * escrow's spendable VTXOs that are about to be spent), so any overfunding surplus is returned to
 * the buyer and `sum(outputs) == sum(inputs)` holds (Arkade offchain fee = 0). The server
 * re-derives the same breakdown from the same VTXO set when validating.
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
  if (!breakdown)
    throw new Error("Invalid breakdown: refund + fees exceed the total");

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

/**
 * Finalize the dispute settlement as the favoured party:
 * add the favoured party's signature to the admin-signed checkpoints and return them
 * so the server can call `finalizeTx`.
 */
export async function finalizeDisputeAsFavoured(params: {
  adminSignedCheckpoints: string[];
  identity: Identity;
}): Promise<string[]> {
  const { adminSignedCheckpoints, identity } = params;

  return Promise.all(
    adminSignedCheckpoints.map(async (cp) => {
      const signed = await identity.sign(Transaction.fromPSBT(base64.decode(cp)), [0]);
      return base64.encode(signed.toPSBT());
    })
  );
}
