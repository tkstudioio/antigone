"use client";

import type { EncryptedVault } from "@/types/account";

/**
 * Cifratura della mnemonic a riposo.
 *
 * La passphrase scelta dall'utente svolge due ruoli (vedi docs/auth.md):
 *  - 13ª parola BIP39 (entra nella derivazione delle chiavi);
 *  - segreto da cui qui deriviamo, via PBKDF2, la chiave AES-GCM con cui cifriamo
 *    la mnemonic prima di salvarla in localStorage.
 *
 * La passphrase non viene mai persistita: serve di nuovo per decifrare e ri-derivare.
 */

const PBKDF2_ITERATIONS = 600_000;
const PBKDF2_HASH = "SHA-256";
const SALT_BYTES = 16;
const IV_BYTES = 12;
const AES_KEY_BITS = 256;

function toBase64(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function fromBase64(value: string): Uint8Array<ArrayBuffer> {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/** Codifica una stringa UTF-8 in un Uint8Array garantito ArrayBuffer-backed. */
function encodeUtf8(value: string): Uint8Array<ArrayBuffer> {
  return new Uint8Array(new TextEncoder().encode(value));
}

/** Deriva una chiave AES-GCM dalla passphrase tramite PBKDF2. */
async function deriveAesKey(
  passphrase: string,
  salt: Uint8Array<ArrayBuffer>,
  iterations: number
): Promise<CryptoKey> {
  const baseKey = await crypto.subtle.importKey("raw", encodeUtf8(passphrase), "PBKDF2", false, [
    "deriveKey",
  ]);

  return crypto.subtle.deriveKey(
    { name: "PBKDF2", salt, iterations, hash: PBKDF2_HASH },
    baseKey,
    { name: "AES-GCM", length: AES_KEY_BITS },
    false,
    ["encrypt", "decrypt"]
  );
}

/** Cifra la mnemonic con una chiave derivata dalla passphrase. */
export async function encryptMnemonic(
  mnemonic: string,
  passphrase: string
): Promise<EncryptedVault> {
  const salt = crypto.getRandomValues(new Uint8Array(SALT_BYTES));
  const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES));
  const key = await deriveAesKey(passphrase, salt, PBKDF2_ITERATIONS);

  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    encodeUtf8(mnemonic)
  );

  return {
    ciphertext: toBase64(new Uint8Array(ciphertext)),
    iv: toBase64(iv),
    salt: toBase64(salt),
    iterations: PBKDF2_ITERATIONS,
  };
}

/**
 * Decifra la mnemonic. L'auth tag AES-GCM funge da verifica della passphrase:
 * una passphrase errata fa fallire la `decrypt` e qui solleviamo un errore parlante.
 */
export async function decryptMnemonic(vault: EncryptedVault, passphrase: string): Promise<string> {
  const salt = fromBase64(vault.salt);
  const iv = fromBase64(vault.iv);
  const key = await deriveAesKey(passphrase, salt, vault.iterations);

  try {
    const plaintext = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv },
      key,
      fromBase64(vault.ciphertext)
    );
    return new TextDecoder().decode(plaintext);
  } catch {
    throw new Error("Passphrase errata");
  }
}
