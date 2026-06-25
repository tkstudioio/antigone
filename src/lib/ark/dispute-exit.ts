/**
 * Stage 2 placeholder — unilateral CSV exit for dispute escrows.
 *
 * When the Arkade operator is unavailable (censors / disappears), the favoured party can exit
 * via the CSV spending path (leaf 4 for seller-favoured, leaf 5 for buyer-favoured) after the
 * `unilateralExitDelay` timelock expires. This requires:
 *   - An on-chain provider (Esplora/Electrum) to broadcast the unroll transaction.
 *   - On-chain funds for unroll + CPFP fee bumps (the exiting party pays mining fees).
 *   - `Unroll.Session` from the Arkade SDK to unroll the VTXO tree to on-chain.
 *   - A co-signature from the admin (server-side) on the CSV exit leaf.
 *
 * Stage 2 flow (not yet implemented):
 *   1. `startDisputeExit`: build the unroll tx, submit to the ASP if still alive (or broadcast
 *      directly), obtain the connector UTXO, build the CSV spend on leaf 4/5 with admin co-sig.
 *   2. `continueDisputeExit`: after the timelock expires, broadcast the exit tx on-chain.
 *
 * NOTE: Do NOT import `server-only` here — this file may also run client-side (the unroll
 * tx is built in the user's browser). The admin co-signature for CSV exits calls a dedicated
 * server endpoint.
 */

/**
 * Begin a unilateral CSV exit for a dispute settlement.
 *
 * @throws Always — Stage 2 not yet implemented.
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export async function startDisputeExit(_params: {
  orderId: number;
  conclusionStatus: string;
}): Promise<never> {
  throw new Error("Exit unilaterale non ancora disponibile");
}

/**
 * Continue a previously started CSV exit after the timelock expires.
 *
 * @throws Always — Stage 2 not yet implemented.
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export async function continueDisputeExit(_params: {
  orderId: number;
  exitState: string;
}): Promise<never> {
  throw new Error("Exit unilaterale non ancora disponibile");
}
