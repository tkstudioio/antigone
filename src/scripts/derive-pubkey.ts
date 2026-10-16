/**
 * Local helper for instance operators: derive the admin's compressed pubkey (what the server needs
 * as `ADMIN_PUBKEY`) from the admin's mnemonic + passphrase WITHOUT putting the mnemonic on the
 * server. Run it on your own machine, never on the host:
 *
 *   DERIVE_MNEMONIC="word1 ... word12" DERIVE_PASSPHRASE="your 13th word" pnpm derive:pubkey
 *
 * The secrets are read ONLY from the environment of this invocation (never from `.env`) and are
 * never written anywhere; only the public key is printed. The derivation is the same one the
 * browser uses at login (`mnemonicToPrivateKey` + `derivePubkey`, BIP84 `m/84'/0'/0'/0/0`), so the
 * printed key is the one the admin logs in with.
 */
import { derivePubkey, mnemonicToPrivateKey, validateMnemonic } from "@/lib/utils";

const mnemonic = process.env.DERIVE_MNEMONIC?.trim();
const passphrase = process.env.DERIVE_PASSPHRASE ?? "";

if (!mnemonic) {
  console.error(
    'Missing DERIVE_MNEMONIC. Usage: DERIVE_MNEMONIC="word1 ... word12" DERIVE_PASSPHRASE="..." pnpm derive:pubkey'
  );
  process.exit(1);
}

if (!validateMnemonic(mnemonic)) {
  console.error("DERIVE_MNEMONIC is not a valid BIP39 mnemonic.");
  process.exit(1);
}

console.log(derivePubkey(mnemonicToPrivateKey(mnemonic, passphrase)));
