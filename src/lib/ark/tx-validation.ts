import { P2A, Transaction } from "@arkade-os/sdk";
import { base64, hex } from "@scure/base";

/**
 * Shared validation gates for Arkade offchain settlement transactions (release + dispute).
 *
 * NOT `server-only`: these run both server-side (dispute settlement validation in
 * `mutations-dispute.ts`) and client-side (the buyer verifying the seller's release PSBT before
 * co-signing it in `release.ts`). The server never sees a private key here; this is pure inspection.
 *
 * Arkade offchain txs come in two layers: the `checkpoint` PSBTs spend the escrow's real VTXOs, and
 * the `ark tx` spends the checkpoint outputs. Validation checks the two layers separately:
 *   GATE #1 — every checkpoint input spends a VTXO that belongs to THIS escrow (`allowedOutpoints`).
 *   GATE #2 — every ark tx input spends one of the supplied checkpoints (binds outputs to funds).
 *   GATE #3 — the ark tx outputs match the expected set (order-independent; P2A anchor skipped).
 *   GATE #4 — value conservation: sum(outputs) == expected total (Arkade offchain fee = 0).
 */

/** An expected output. `pkScriptHex === ""` matches any pkScript (e.g. the favoured party's own address). */
export type ExpectedOutput = { amount: bigint; pkScriptHex: string };

export type DecodedSettlementTx = { arkTx: Transaction; checkpointTxs: Transaction[] };

/** Decode the base64 ark tx + checkpoint PSBTs with the SDK Transaction class. Returns an error string on failure. */
export function decodeSettlementTx(
  arkPsbtB64: string,
  checkpointPsbtsB64: string[]
): DecodedSettlementTx | { error: string } {
  try {
    const arkTx = Transaction.fromPSBT(base64.decode(arkPsbtB64));
    const checkpointTxs = checkpointPsbtsB64.map((cp) => Transaction.fromPSBT(base64.decode(cp)));
    return { arkTx, checkpointTxs };
  } catch (err) {
    return { error: `PSBT non valido: ${err instanceof Error ? err.message : String(err)}` };
  }
}

/**
 * GATE #1 + #2 — bind the spend to this escrow.
 *
 * Every checkpoint input must spend one of `allowedOutpoints` (this escrow's spendable VTXOs), and
 * every ark tx input must spend one of the supplied checkpoints. Txids are accepted in either byte
 * orientation so the gate never false-rejects over btc-signer's internal/display convention; a
 * foreign outpoint/checkpoint matches neither orientation, so the binding still holds.
 *
 * `allowedOutpoints` holds the indexer's display-order `txid:vout` strings.
 */
export function assertSpendsOnlyEscrow(
  arkTx: Transaction,
  checkpointTxs: Transaction[],
  allowedOutpoints: Set<string>
): string | null {
  const outpointAllowed = (txid: Uint8Array, index: number): boolean => {
    const asIs = `${hex.encode(txid)}:${index}`;
    const reversed = `${hex.encode(txid.slice().reverse())}:${index}`;
    return allowedOutpoints.has(asIs) || allowedOutpoints.has(reversed);
  };

  if (checkpointTxs.length === 0) return "Nessun checkpoint nella transazione";
  for (const cp of checkpointTxs) {
    if (cp.inputsLength === 0) return "Checkpoint senza input";
    for (let i = 0; i < cp.inputsLength; i++) {
      const inp = cp.getInput(i);
      if (!outpointAllowed(inp.txid!, inp.index!)) {
        return `Input non appartenente all'escrow: ${hex.encode(inp.txid!)}:${inp.index}`;
      }
    }
  }

  const checkpointTxids = new Set<string>();
  for (const c of checkpointTxs) {
    checkpointTxids.add(c.id);
    checkpointTxids.add(hex.encode(hex.decode(c.id).slice().reverse()));
  }
  if (arkTx.inputsLength === 0) return "Nessun input nella transazione";
  for (let i = 0; i < arkTx.inputsLength; i++) {
    const inp = arkTx.getInput(i);
    const txid = hex.encode(inp.txid!);
    if (!checkpointTxids.has(txid)) {
      return `Input dell'ark tx non legato ai checkpoint: ${txid}:${inp.index}`;
    }
  }

  return null;
}

/** The ark tx outputs that are NOT the mandatory P2A fee-bumping anchor (value 0, fixed script). */
function spendableOutputs(arkTx: Transaction): { amount: bigint; pkScriptHex: string }[] {
  const p2aScriptHex = hex.encode(P2A.script);
  const outputs: { amount: bigint; pkScriptHex: string }[] = [];
  for (let i = 0; i < arkTx.outputsLength; i++) {
    const out = arkTx.getOutput(i);
    const pkScriptHex = hex.encode(out.script!);
    if (pkScriptHex === p2aScriptHex) continue;
    outputs.push({ amount: out.amount!, pkScriptHex });
  }
  return outputs;
}

/**
 * GATE #3 — the ark tx outputs (excluding the P2A anchor) match `expected`, order-independent.
 * An expected entry with `pkScriptHex === ""` matches any pkScript of the right amount.
 */
export function assertOutputsMatch(arkTx: Transaction, expected: ExpectedOutput[]): string | null {
  const actual = spendableOutputs(arkTx);
  if (actual.length !== expected.length) {
    return `Numero di output non corretto: attesi ${expected.length}, ricevuti ${actual.length}`;
  }
  const unmatched = [...expected];
  for (const out of actual) {
    const idx = unmatched.findIndex(
      (exp) =>
        exp.amount === out.amount && (exp.pkScriptHex === "" || exp.pkScriptHex === out.pkScriptHex)
    );
    if (idx === -1) {
      return `Output non atteso: importo=${out.amount} script=${out.pkScriptHex}`;
    }
    unmatched.splice(idx, 1);
  }
  return null;
}

/** GATE #4 — value conservation: sum of the non-anchor outputs equals `expectedTotal`. */
export function assertValueConserved(arkTx: Transaction, expectedTotal: bigint): string | null {
  const total = spendableOutputs(arkTx).reduce((s, o) => s + o.amount, BigInt(0));
  if (total !== expectedTotal) {
    return `Conservazione del valore violata: somma output ${total} != atteso ${expectedTotal}`;
  }
  return null;
}
