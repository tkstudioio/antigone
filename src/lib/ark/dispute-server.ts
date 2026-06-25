import "server-only";

import { RestArkProvider, Transaction } from "@arkade-os/sdk";
import { base64 } from "@scure/base";

import type { Identity } from "@arkade-os/sdk";

/**
 * Server-only helpers for the dispute settlement signatures.
 *
 * Admin and operator sign server-side so that:
 *   1. The admin private key (ADMIN_MNEMONIC) never leaves the server.
 *   2. The `submitTx` / `finalizeTx` calls are atomic with the DB transitions.
 *
 * Pattern mirrors the operator role in `collaborateRelease` (step 2 of happy-path release),
 * but here it is the admin who co-signs the ark tx and the checkpoints.
 */

export type SubmitDisputeResult = {
  disputeArkTxid: string;
  serverSignedCheckpoints: string[];
  adminSignedCheckpoints: string[];
};

/**
 * Co-sign the favoured party's ark tx as admin, submit to the operator, and sign the
 * returned checkpoints as admin.
 *
 * The favoured party already signed the ark tx before sending it to this function.
 * The admin adds the second signature; `submitTx` then calls the operator for the third
 * (operator co-sign is mandatory for any collaborative leaf — the operator must co-sign
 * every offchain tx per Arkade protocol). The operator returns the checkpoint PSBTs
 * (partially signed by the operator); the admin then adds its signature to each.
 *
 * @param favouredSignedArkPsbt  base64 PSBT already signed by the favoured party.
 * @param checkpointPsbts        base64 unsigned checkpoint PSBTs from `buildOffchainTx`.
 * @param adminIdentity          Admin signing key (`SingleKey.fromHex(mnemonicToPrivateKey(ADMIN_MNEMONIC))`).
 * @param arkProvider            `RestArkProvider` pointing at the Arkade operator.
 */
export async function submitDisputeAsAdmin(params: {
  favouredSignedArkPsbt: string;
  checkpointPsbts: string[];
  adminIdentity: Identity;
  arkProvider: RestArkProvider;
}): Promise<SubmitDisputeResult> {
  const { favouredSignedArkPsbt, checkpointPsbts, adminIdentity, arkProvider } = params;

  // Admin adds its signature to the ark tx (favoured party signed first).
  const adminSignedArkTx = await adminIdentity.sign(
    Transaction.fromPSBT(base64.decode(favouredSignedArkPsbt))
  );

  // Submit to the operator: operator co-signs the ark tx (third signature for a 3-of-3 leaf)
  // and returns the server-signed checkpoint PSBTs.
  const { arkTxid, signedCheckpointTxs } = await arkProvider.submitTx(
    base64.encode(adminSignedArkTx.toPSBT()),
    checkpointPsbts
  );

  // Admin signs each checkpoint (index 0 = the input being spent in the checkpoint).
  const adminSignedCheckpoints = await Promise.all(
    signedCheckpointTxs.map(async (cp) => {
      const signed = await adminIdentity.sign(Transaction.fromPSBT(base64.decode(cp)), [0]);
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
 * Finalize the dispute settlement: submit the fully-signed checkpoints to the operator.
 * The favoured party added the final signature (via `finalizeDisputeAsFavoured`) before
 * calling this.
 *
 * @param disputeArkTxid        The ark tx id returned by `submitTx`.
 * @param fullySignedCheckpoints  base64 checkpoint PSBTs signed by all required parties.
 * @param arkProvider           `RestArkProvider` pointing at the Arkade operator.
 */
export async function finalizeDispute(params: {
  disputeArkTxid: string;
  fullySignedCheckpoints: string[];
  arkProvider: RestArkProvider;
}): Promise<void> {
  const { disputeArkTxid, fullySignedCheckpoints, arkProvider } = params;
  await arkProvider.finalizeTx(disputeArkTxid, fullySignedCheckpoints);
}
