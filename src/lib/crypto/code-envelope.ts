/**
 * License-code envelopes: a thin layer over the chat envelope scheme (`message-envelope.ts`).
 * Isomorphic (browser + Node). NO server-only import — plaintext codes and private keys only ever
 * exist in the browser; the server stores ciphertext, wrapped content keys and the dedup hash.
 *
 * Lifecycle of a code:
 *  1. upload  — the seller encrypts it into an envelope addressed to itself only;
 *  2. deliver — on order confirmation the seller re-wraps the content key toward the buyer;
 *  3. dispute — a party re-wraps the content key toward the arbiter.
 */
import { hmac } from "@noble/hashes/hmac.js";
import { hkdf } from "@noble/hashes/hkdf.js";
import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex, hexToBytes } from "@noble/hashes/utils.js";
import { buildEnvelope, openEnvelope, rewrapCekForRecipient } from "./message-envelope";

/** Versioned HKDF label for the seller-derived dedup secret. */
const DEDUP_INFO = new TextEncoder().encode("antigone/code-dedup/v1");

/** A code encrypted for its seller: the shape sent to `POST /api/stocks`. */
export type EncryptedCode = {
  ciphertext: string;
  wrappedCek: string;
  codeHash: string;
};

/**
 * Dedup hash of a (trimmed) code: HMAC-SHA256 keyed by a secret derived (HKDF) from the seller's
 * private key. The server cannot brute-force short codes from it, and it only matches within the
 * same seller.
 */
export function computeCodeHash(sellerPrivHex: string, code: string): string {
  const dedupKey = hkdf(sha256, hexToBytes(sellerPrivHex), new Uint8Array(0), DEDUP_INFO, 32);
  return bytesToHex(hmac(sha256, dedupKey, new TextEncoder().encode(code)));
}

/** Encrypt a code with the seller as the only recipient and compute its dedup hash. */
export async function sealCodeForSeller(params: {
  sellerPrivHex: string;
  sellerPubHex: string;
  code: string;
}): Promise<EncryptedCode> {
  const { sellerPrivHex, sellerPubHex, code } = params;
  const envelope = await buildEnvelope({
    senderPrivHex: sellerPrivHex,
    senderPubHex: sellerPubHex,
    recipientPubkeys: [sellerPubHex],
    plaintext: code,
  });
  return {
    ciphertext: envelope.ciphertext,
    wrappedCek: envelope.keys[0].wrappedCek,
    codeHash: computeCodeHash(sellerPrivHex, code),
  };
}

/** Decrypt a code with the recipient's key. Throws when the wrap or the ciphertext is invalid. */
export async function decryptCodeForRecipient(params: {
  recipientPrivHex: string;
  wrapperPubHex: string;
  ciphertext: string;
  wrappedCek: string;
}): Promise<string> {
  return openEnvelope(params);
}

/**
 * Re-wrap the content key of a code toward another recipient (the buyer on delivery, the arbiter on
 * dispute). The holder unwraps with its own key; the new wrap carries the holder as wrapper.
 */
export async function rewrapCodeKey(params: {
  holderPrivHex: string;
  holderPubHex: string;
  wrapperPubHex: string;
  wrappedCek: string;
  newRecipientPubHex: string;
}): Promise<string> {
  const rewrapped = await rewrapCekForRecipient(params);
  return rewrapped.wrappedCek;
}

/**
 * Outcome of opening a stored code in the browser:
 *  - `ok`            decrypted;
 *  - `missing`       nothing to open (no ciphertext / no wrapped key for this viewer, or wallet locked);
 *  - `undecryptable` a wrap exists but does not open (corrupt data, or a malicious wrapper).
 */
export type CodeStatus = "ok" | "missing" | "undecryptable";

/** Fault-tolerant wrapper over {@link decryptCodeForRecipient}: never throws. */
export async function openStoredCode(params: {
  recipientPrivHex: string | undefined;
  ciphertext: string | null;
  wrappedCek: string | null;
  wrapperPubkey: string | null;
}): Promise<{ code: string | null; status: CodeStatus }> {
  const { recipientPrivHex, ciphertext, wrappedCek, wrapperPubkey } = params;
  if (!recipientPrivHex || !ciphertext || !wrappedCek || !wrapperPubkey) {
    return { code: null, status: "missing" };
  }
  try {
    const code = await decryptCodeForRecipient({
      recipientPrivHex,
      wrapperPubHex: wrapperPubkey,
      ciphertext,
      wrappedCek,
    });
    return { code, status: "ok" };
  } catch {
    return { code: null, status: "undecryptable" };
  }
}
