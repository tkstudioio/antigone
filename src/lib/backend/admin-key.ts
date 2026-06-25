import "server-only";

import { mnemonicToPrivateKey, derivePubkey } from "@/lib/utils";

/**
 * The platform admin identity, derived from ADMIN_MNEMONIC + ADMIN_PASSPHRASE.
 * Single source of truth for the admin private/public key used in the isAdmin check,
 * escrow arbiter signing, dispute co-signing, and dispute chat re-encryption.
 * Returns null when admin is disabled or the mnemonic is invalid.
 */
export function getAdminPrivateKey(): string | null {
  const mnemonic = process.env.ADMIN_MNEMONIC;
  if (!mnemonic) return null;
  try {
    // ADMIN_PASSPHRASE = 13ª parola: unica identità admin (login + arbiter + firma).
    return mnemonicToPrivateKey(mnemonic, process.env.ADMIN_PASSPHRASE);
  } catch {
    return null;
  }
}

export function getAdminPubkey(): string | null {
  const privkey = getAdminPrivateKey();
  if (!privkey) return null;
  try {
    return derivePubkey(privkey);
  } catch {
    return null;
  }
}
