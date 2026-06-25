import "server-only";

import { ArkAddress, RestIndexerProvider } from "@arkade-os/sdk";
import { hex } from "@scure/base";
import { ARK_SERVER_URL } from "@/lib/ark";

export type EscrowFunding = {
  /** Total value (sats) of spendable VTXOs currently locked at the escrow address. */
  total: number;
  /** True once the locked amount covers the escrow price. */
  funded: boolean;
  /**
   * Soonest batch-expiry (epoch ms) among the locked VTXOs, or `null` if none are locked. After this
   * the operator can sweep the funds (see Arkade "Batch Expiry"); the order must be resolved before
   * then. The marketplace has no escrow-renewal mechanism (renewal would need buyer+seller online
   * together), so this is the hard deadline for a dispute/release.
   */
  soonestExpiry: number | null;
};

/**
 * The spendable VTXOs locked at an escrow address: their `txid:vout` outpoints (display byte order,
 * matching the indexer) and the sum of their values. A single indexer query backs both, so callers
 * that need the outpoint set AND the locked total (e.g. dispute settlement) stay internally
 * consistent (no race between two separate reads).
 */
export type EscrowVtxoSet = {
  outpoints: Set<string>;
  total: number;
  /** Soonest `virtualStatus.batchExpiry` (epoch ms) among the locked VTXOs, or `null` if none. */
  soonestExpiry: number | null;
};

/** One indexer query for the spendable VTXOs of an escrow → `{ outpoints, total, soonestExpiry }`. */
export async function getEscrowVtxoSet(address: string): Promise<EscrowVtxoSet> {
  const indexer = new RestIndexerProvider(ARK_SERVER_URL);
  const pkScript = hex.encode(ArkAddress.decode(address).pkScript);
  const { vtxos } = await indexer.getVtxos({ scripts: [pkScript], spendableOnly: true });
  const outpoints = new Set(vtxos.map((v) => `${v.txid}:${v.vout}`));
  const total = vtxos.reduce((sum, v) => sum + v.value, 0);
  const expiries = vtxos
    .map((v) => v.virtualStatus?.batchExpiry)
    .filter((e): e is number => typeof e === "number" && e > 0);
  const soonestExpiry = expiries.length > 0 ? Math.min(...expiries) : null;
  return { outpoints, total, soonestExpiry };
}

/**
 * Query the Arkade indexer for the VTXOs locked at an escrow address and report whether the
 * escrow is funded. Runs server-side (the operator REST endpoint is reachable without a wallet).
 * A VTXO counts as locked while it is unspent — once the funds are released the spend marks it
 * `isSpent`, so a released escrow naturally reports `funded: false`.
 */
export async function getEscrowFunding(address: string, price: number): Promise<EscrowFunding> {
  const { total, soonestExpiry } = await getEscrowVtxoSet(address);
  return { total, funded: total >= price, soonestExpiry };
}

/**
 * Query the indexer for the spendable VTXOs locked at an escrow address and return their outpoints
 * as a `txid:vout` set. Used by the dispute settlement gate to assert that the favoured party's
 * settlement tx spends ONLY this escrow's funds (and not some other escrow the admin also arbitrates).
 * The indexer returns `txid` in display (big-endian) byte order — match that when comparing.
 */
export async function getEscrowVtxoOutpoints(address: string): Promise<Set<string>> {
  const { outpoints } = await getEscrowVtxoSet(address);
  return outpoints;
}
