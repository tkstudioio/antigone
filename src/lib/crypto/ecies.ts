/**
 * Isomorphic ECIES primitives (browser + Node). NO server-only import.
 *
 * Scheme: ECDH(secp256k1) -> HKDF-SHA256(x-coordinate) -> AES-256-GCM (Web Crypto).
 * Pubkeys are 33-byte compressed hex (as derivePubkey produces). Standard ECDH is
 * symmetric here because the stored pubkeys carry real Y-parity. We HKDF over the
 * shared secret's x-coordinate (slice(1)) for robustness.
 *
 * Sealed format: `v1:<iv_b64>:<ciphertextWithTag_b64>` (Web Crypto appends the GCM
 * tag to the ciphertext). This intentionally differs from the 4-part node:crypto
 * format in symmetric.ts; they are separate modules.
 */
import { secp256k1 } from "@noble/curves/secp256k1.js";
import { hkdf } from "@noble/hashes/hkdf.js";
import { sha256 } from "@noble/hashes/sha2.js";
import { hexToBytes, bytesToHex } from "@noble/hashes/utils.js";

const VERSION = "v1";
const WRAP_INFO = new TextEncoder().encode("antigone-cek-wrap-v1");

// Web Crypto is global in modern Node (>=20) and browsers.
const subtle = globalThis.crypto.subtle;

function b64encode(bytes: Uint8Array): string {
  if (typeof btoa === "function") {
    let bin = "";
    for (const byte of bytes) bin += String.fromCharCode(byte);
    return btoa(bin);
  }
  return Buffer.from(bytes).toString("base64");
}

function b64decode(s: string): Uint8Array {
  if (typeof atob === "function") {
    const bin = atob(s);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }
  return new Uint8Array(Buffer.from(s, "base64"));
}

// Copy into a standalone ArrayBuffer so the value satisfies BufferSource (Web Crypto rejects
// the `ArrayBufferLike`/SharedArrayBuffer-typed views that @noble returns under strict DOM libs).
function ab(u: Uint8Array): ArrayBuffer {
  return u.buffer.slice(u.byteOffset, u.byteOffset + u.byteLength) as ArrayBuffer;
}

/** Random 256-bit content-encryption key. */
export function randomCek(): Uint8Array {
  return globalThis.crypto.getRandomValues(new Uint8Array(32));
}

async function importAesKey(raw: Uint8Array): Promise<CryptoKey> {
  return subtle.importKey("raw", ab(raw), { name: "AES-GCM" }, false, ["encrypt", "decrypt"]);
}

/** AES-256-GCM seal -> `v1:<iv>:<ctTag>`. */
async function seal(keyBytes: Uint8Array, plaintext: Uint8Array): Promise<string> {
  const iv = globalThis.crypto.getRandomValues(new Uint8Array(12));
  const key = await importAesKey(keyBytes);
  const ctTag = new Uint8Array(
    await subtle.encrypt({ name: "AES-GCM", iv: ab(iv) }, key, ab(plaintext))
  );
  return `${VERSION}:${b64encode(iv)}:${b64encode(ctTag)}`;
}

/** AES-256-GCM open from `v1:<iv>:<ctTag>`. Throws on bad format or failed auth. */
async function open(keyBytes: Uint8Array, sealed: string): Promise<Uint8Array> {
  const parts = sealed.split(":");
  if (parts.length !== 3 || parts[0] !== VERSION) {
    throw new Error("Unrecognized ECIES sealed format");
  }
  const iv = b64decode(parts[1]);
  const ctTag = b64decode(parts[2]);
  const key = await importAesKey(keyBytes);
  return new Uint8Array(await subtle.decrypt({ name: "AES-GCM", iv: ab(iv) }, key, ab(ctTag)));
}

/** Derive the per-pair wrapping key: HKDF-SHA256 over the ECDH shared x-coordinate. */
function deriveWrapKey(privHex: string, pubHex: string): Uint8Array {
  const shared = secp256k1.getSharedSecret(hexToBytes(privHex), hexToBytes(pubHex)); // 33 bytes
  const x = shared.slice(1); // 32-byte x-coordinate
  return hkdf(sha256, x, new Uint8Array(0), WRAP_INFO, 32);
}

/** Encrypt message content under the CEK. */
export async function encryptContent(cek: Uint8Array, plaintext: string): Promise<string> {
  return seal(cek, new TextEncoder().encode(plaintext));
}

/** Decrypt message content under the CEK. */
export async function decryptContent(cek: Uint8Array, sealed: string): Promise<string> {
  return new TextDecoder().decode(await open(cek, sealed));
}

/** Wrap a CEK toward `recipientPubHex` using `senderPrivHex`. */
export async function wrapCek(
  senderPrivHex: string,
  recipientPubHex: string,
  cek: Uint8Array
): Promise<string> {
  return seal(deriveWrapKey(senderPrivHex, recipientPubHex), cek);
}

/** Unwrap a CEK with `recipientPrivHex`, using `wrapperPubHex` as the ECDH counterpart. */
export async function unwrapCek(
  recipientPrivHex: string,
  wrapperPubHex: string,
  wrappedCek: string
): Promise<Uint8Array> {
  return open(deriveWrapKey(recipientPrivHex, wrapperPubHex), wrappedCek);
}

/** True if a stored value is in the encrypted `v1:` envelope form. */
export function isEnvelope(value: string | null | undefined): boolean {
  return typeof value === "string" && value.startsWith(`${VERSION}:`);
}

export { bytesToHex };
