import {
  CSVMultisigTapscript,
  DefaultVtxo,
  MultisigTapscript,
  RelativeTimelock,
  VtxoScript,
  networks,
} from "@arkade-os/sdk";
import { secp256k1 } from "@noble/curves/secp256k1.js";
import { sha256 } from "@noble/hashes/sha2.js";
import { hex } from "@scure/base";

/**
 * Taproot NUMS point (the standard unspendable internal key, also used as Arkade VTXO key-path).
 * Its discrete log is unknown by construction, which is what makes the commitment leaf below
 * provably non-spendable. Parsed once at module load.
 */
const NUMS_POINT = secp256k1.Point.fromHex(
  "0250929b74c1a04954b78b4b6035e97a5e078a5a0f28ec96d547bfee9ace803ac0"
);

/**
 * Shared (client + server) escrow contract builder.
 *
 * Builds the Arkade-OS VTXO script for a marketplace order escrow as a trustless
 * contract: no single party (buyer, seller, admin/arbiter, operator) can move the
 * funds alone. The script itself embeds CSV exit paths (4–6) so the operator is not
 * a single point of failure *by design*; note however that the client tooling to
 * actually drive a unilateral exit when the operator disappears is Stage 2 and not
 * yet implemented (see `dispute-exit.ts`), so today recovery still relies on the
 * operator being available. The same
 * function MUST be used on both server (to derive and persist the escrow address
 * at checkout) and client (to re-derive the address and verify it matches before
 * funding). Determinism depends on identical inputs AND identical leaf ordering —
 * both are guaranteed here as long as both sides call this function.
 *
 * Six spending paths. Per the Arkade protocol, a *collaborative* path (offchain,
 * instant) MUST include the operator pubkey so it can co-sign; an *exit* path
 * (onchain, unilateral fallback when the operator disappears/censors) MUST use a
 * CSV relative timelock (the operator's `unilateralExitDelay`) and MUST NOT
 * include the operator. So every collaborative path has a CSV twin:
 *
 *   Collaborative (operator co-signs, offchain, instant):
 *     1. buyer + seller + operator — happy release / mutual cancel
 *     2. seller + admin + operator — dispute resolved for the seller
 *     3. buyer + admin + operator  — dispute resolved for the buyer / refund
 *   Unilateral exit (CSV = unilateralExitDelay, no operator):
 *     4. buyer + seller + CSV — twin of path 1
 *     5. seller + admin + CSV — twin of path 2
 *     6. buyer + admin + CSV  — twin of path 3
 *
 * Partial refunds (`partially_refunded`) need no dedicated path: paths 2/3 (or
 * 5/6) can build a transaction with multiple outputs; the party that only
 * receives funds does not need to sign.
 *
 * Pubkeys are passed as 33-byte compressed hex (the format used across the app:
 * `Account.pubkey`, `derivePubkey`, `getInfo().signerPubkey`) and converted to
 * 32-byte x-only internally.
 */
export type EscrowParams = {
  /** 33-byte compressed hex */
  buyerPubkey: string;
  /** 33-byte compressed hex */
  sellerPubkey: string;
  /** Platform admin / arbiter — 33-byte compressed hex (ADMIN_MNEMONIC derived) */
  adminPubkey: string;
  /** Arkade operator — 33-byte compressed hex (getInfo().signerPubkey) */
  serverPubkey: string;
  /** Operator's CSV exit delay (raw `getInfo().unilateralExitDelay` value), used for the exit paths. */
  exitDelay: number;
  /**
   * Per-order commitment nonce: 64-char hex string (32 bytes). Tweaks the NUMS point to derive the
   * x-only pubkey of a non-spendable 7th tapleaf that makes the taproot address unique per order
   * without touching the 6 spending paths. Generated server-side with CSPRNG and persisted in
   * `Escrow.nonce`; it is shared with the client (it must re-derive the address), so it is NOT a
   * secret — security relies on the NUMS commitment having an unknown discrete log, not on the
   * nonce being private. Must be identical on server (address derivation) and client (re-derivation
   * + release).
   */
  scriptNonce: string;
  /** Bech32 human-readable prefix. Defaults to the mutinynet hrp (`tark`). */
  hrp?: string;
};

/** Convert a 33-byte compressed pubkey hex to 32-byte x-only bytes. */
export function xOnly(compressedHex: string): Uint8Array {
  const bytes = hex.decode(compressedHex);
  return bytes.length === 33 ? bytes.slice(1) : bytes;
}

/**
 * Mirror the SDK's `delayToTimelock`: a CSV delay below 512 is interpreted as a
 * block count, otherwise as seconds (BIP68 unit boundary).
 */
function exitDelayToTimelock(exitDelay: number): RelativeTimelock {
  return { value: BigInt(exitDelay), type: exitDelay < 512 ? "blocks" : "seconds" };
}

/**
 * Leaf 0 of the escrow tree: the happy-path collaborative script (buyer + seller + operator).
 * Exposed on its own so the release builder can locate this leaf via `VtxoScript.findLeaf`.
 */
export function buildCollaborativeLeafScript(params: EscrowParams): Uint8Array {
  return MultisigTapscript.encode({
    pubkeys: [xOnly(params.buyerPubkey), xOnly(params.sellerPubkey), xOnly(params.serverPubkey)],
  }).script;
}

/**
 * Leaf 1 of the escrow tree: dispute resolved for the seller (seller + admin + operator).
 * Exposed so the dispute settlement builder can locate this leaf via `VtxoScript.findLeaf`.
 */
export function buildDisputeSellerLeafScript(params: EscrowParams): Uint8Array {
  return MultisigTapscript.encode({
    pubkeys: [xOnly(params.sellerPubkey), xOnly(params.adminPubkey), xOnly(params.serverPubkey)],
  }).script;
}

/**
 * Leaf 2 of the escrow tree: dispute resolved for the buyer / refund (buyer + admin + operator).
 * Exposed so the dispute settlement builder can locate this leaf via `VtxoScript.findLeaf`.
 */
export function buildDisputeBuyerLeafScript(params: EscrowParams): Uint8Array {
  return MultisigTapscript.encode({
    pubkeys: [xOnly(params.buyerPubkey), xOnly(params.adminPubkey), xOnly(params.serverPubkey)],
  }).script;
}

/**
 * Leaf 4 (CSV twin of leaf 1): seller + admin exit without the operator. Reserved for Stage 2.
 * @internal Stage 2 — not used in Stage 1.
 */
export function buildExitDisputeSellerLeafScript(params: EscrowParams): Uint8Array {
  const timelock = exitDelayToTimelock(params.exitDelay);
  return CSVMultisigTapscript.encode({
    pubkeys: [xOnly(params.sellerPubkey), xOnly(params.adminPubkey)],
    timelock,
  }).script;
}

/**
 * Leaf 5 (CSV twin of leaf 2): buyer + admin exit without the operator. Reserved for Stage 2.
 * @internal Stage 2 — not used in Stage 1.
 */
export function buildExitDisputeBuyerLeafScript(params: EscrowParams): Uint8Array {
  const timelock = exitDelayToTimelock(params.exitDelay);
  return CSVMultisigTapscript.encode({
    pubkeys: [xOnly(params.buyerPubkey), xOnly(params.adminPubkey)],
    timelock,
  }).script;
}

/**
 * Derive the offchain pkScript for a passive recipient (buyer, seller, or admin) who is not the
 * favoured party building the tx. Uses a standard single-key DefaultVtxo script.
 *
 * CRITICAL: the `csvTimelock` MUST equal the operator's `unilateralExitDelay` (the same value the
 * recipient's own Arkade wallet uses when deriving its receiving address — see the SDK Wallet:
 * `offchainOptions.csvTimelock = exitTimelock`). If omitted, `DefaultVtxo.Script` falls back to its
 * DEFAULT_TIMELOCK (144 blocks), producing a DIFFERENT pkScript/address than the recipient's wallet
 * scans — the funds land at a script the wallet never discovers, so the recipient appears to never
 * receive the payout.
 *
 * @param recipientPubkey33hex  33-byte compressed public key of the recipient (hex).
 * @param serverPubkey33hex     33-byte compressed public key of the Arkade operator (hex).
 * @param exitDelay             Operator's CSV exit delay (raw `getInfo().unilateralExitDelay`).
 */
export function deriveRecipientPkScript(
  recipientPubkey33hex: string,
  serverPubkey33hex: string,
  exitDelay: number
): Uint8Array {
  return new DefaultVtxo.Script({
    pubKey: xOnly(recipientPubkey33hex),
    serverPubKey: xOnly(serverPubkey33hex),
    csvTimelock: exitDelayToTimelock(exitDelay),
  }).pkScript;
}

export function buildEscrowVtxoScript(params: EscrowParams): VtxoScript {
  const buyer = xOnly(params.buyerPubkey);
  const seller = xOnly(params.sellerPubkey);
  const server = xOnly(params.serverPubkey);
  const timelock = exitDelayToTimelock(params.exitDelay);

  // Collaborative paths (operator co-signs, offchain, instant).
  // Path 1: buyer + seller agree (happy release / mutual cancel).
  const collaborativePath = buildCollaborativeLeafScript(params);
  // Path 2: arbiter resolves a dispute for the seller — uses exported helper (byte-identical).
  const disputeSellerPath = buildDisputeSellerLeafScript(params);
  // Path 3: arbiter resolves a dispute for the buyer (refund) — uses exported helper (byte-identical).
  const disputeBuyerPath = buildDisputeBuyerLeafScript(params);

  // Unilateral exit paths (CSV = unilateralExitDelay, no operator) — safety net
  // if the operator disappears/censors. Each is the CSV twin of a collaborative path.
  // Path 4: buyer + seller cooperative exit.
  const exitCollaborativePath = CSVMultisigTapscript.encode({
    pubkeys: [buyer, seller],
    timelock,
  }).script;
  // Path 5: seller + admin exit (dispute resolvable for the seller without the operator).
  const exitDisputeSellerPath = buildExitDisputeSellerLeafScript(params);
  // Path 6: buyer + admin exit (dispute resolvable for the buyer without the operator).
  const exitDisputeBuyerPath = buildExitDisputeBuyerLeafScript(params);

  // Leaf 7 (index 6): non-spendable commitment leaf that makes the taproot address unique per
  // order without touching the 6 spending paths above (they stay byte-identical across orders).
  //
  // The nonce is PUBLIC (shared with the client so it can re-derive the address), so it must NOT be
  // usable as a private key. We instead tweak the NUMS point: commitment = NUMS + sha256(nonce)·G.
  // Its discrete log is unknown (it depends on the unknown discrete log of NUMS), so nobody — not
  // even a party holding the nonce — can ever sign for it. Both server and client derive the same
  // public point deterministically without knowing any private key.
  //
  // The leaf is wrapped as MultisigTapscript([commitment, server]): a valid *forfeit closure* per
  // the Arkade protocol (a non-CSV multisig path MUST contain the operator/server pubkey, otherwise
  // the operator rejects the whole tapTree at submitTx with "invalid forfeit closure, signer pubkey
  // not found"). It contains `server` so it passes validation, yet stays unspendable because the
  // `commitment` key can never be signed.
  const nonceBytes = hex.decode(params.scriptNonce);
  if (nonceBytes.length !== 32) {
    throw new Error(
      `scriptNonce non valido: attesi 32 byte (64 char hex), ricevuti ${nonceBytes.length}`
    );
  }
  const tweak =
    BigInt("0x" + hex.encode(sha256(nonceBytes))) % secp256k1.Point.Fn.ORDER || BigInt(1);
  const commitmentXOnly = NUMS_POINT.add(secp256k1.Point.BASE.multiply(tweak))
    .toBytes(true)
    .slice(1);
  const commitmentLeaf = MultisigTapscript.encode({ pubkeys: [commitmentXOnly, server] }).script;

  // Fixed leaf ordering — identical on server and client.
  return new VtxoScript([
    collaborativePath,
    disputeSellerPath,
    disputeBuyerPath,
    exitCollaborativePath,
    exitDisputeSellerPath,
    exitDisputeBuyerPath,
    commitmentLeaf,
  ]);
}

export function deriveEscrowAddress(params: EscrowParams): string {
  const hrp = params.hrp ?? networks.mutinynet.hrp;
  const server = xOnly(params.serverPubkey);
  return buildEscrowVtxoScript(params).address(hrp, server).encode();
}
