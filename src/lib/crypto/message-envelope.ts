/**
 * High-level multi-recipient message envelope built on the ECIES primitives.
 * Isomorphic (browser + Node). NO server-only import.
 *
 * A message has ONE content ciphertext (under a random CEK) plus one wrapped CEK
 * per recipient. Each wrapped key records `wrapperPubkey` — the ECDH counterpart a
 * recipient must use to unwrap — so unwrapping is independent of Message.senderPubkey
 * (this is what lets a dispute party re-wrap toward the admin).
 */
import { randomCek, encryptContent, decryptContent, wrapCek, unwrapCek } from "./ecies";

export type WrappedKey = {
  recipientPubkey: string;
  wrapperPubkey: string;
  wrappedCek: string;
};

export type Envelope = {
  ciphertext: string;
  keys: WrappedKey[];
};

/** Encrypt `plaintext` once and wrap the CEK toward each recipient. */
export async function buildEnvelope(params: {
  senderPrivHex: string;
  senderPubHex: string;
  recipientPubkeys: string[];
  plaintext: string;
}): Promise<Envelope> {
  const { senderPrivHex, senderPubHex, recipientPubkeys, plaintext } = params;
  const cek = randomCek();
  const ciphertext = await encryptContent(cek, plaintext);

  const keys: WrappedKey[] = [];
  for (const recipientPubkey of recipientPubkeys) {
    keys.push({
      recipientPubkey,
      wrapperPubkey: senderPubHex,
      wrappedCek: await wrapCek(senderPrivHex, recipientPubkey, cek),
    });
  }
  return { ciphertext, keys };
}

/** Recover the CEK with the recipient's key and decrypt the content. */
export async function openEnvelope(params: {
  recipientPrivHex: string;
  wrapperPubHex: string;
  ciphertext: string;
  wrappedCek: string;
}): Promise<string> {
  const { recipientPrivHex, wrapperPubHex, ciphertext, wrappedCek } = params;
  const cek = await unwrapCek(recipientPrivHex, wrapperPubHex, wrappedCek);
  return decryptContent(cek, ciphertext);
}

/**
 * Re-wrap an existing wrapped CEK toward a new recipient (the admin, on dispute).
 * The holder unwraps with their own key, then wraps toward `newRecipientPubHex`
 * using their own private key — so the new row's `wrapperPubkey` is the holder's.
 */
export async function rewrapCekForRecipient(params: {
  holderPrivHex: string;
  holderPubHex: string;
  wrapperPubHex: string;
  wrappedCek: string;
  newRecipientPubHex: string;
}): Promise<WrappedKey> {
  const { holderPrivHex, holderPubHex, wrapperPubHex, wrappedCek, newRecipientPubHex } = params;
  const cek = await unwrapCek(holderPrivHex, wrapperPubHex, wrappedCek);
  const rewrapped = await wrapCek(holderPrivHex, newRecipientPubHex, cek);
  return {
    recipientPubkey: newRecipientPubHex,
    wrapperPubkey: holderPubHex,
    wrappedCek: rewrapped,
  };
}
