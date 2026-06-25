// NOTE: intentionally NOT `import "server-only"`. This module uses node:crypto +
// process.env, so it cannot run in a browser bundle anyway, and it is imported by
// tsx-run scripts (seed.ts, the backfill) where the `server-only` marker throws.
import { createCipheriv, createDecipheriv, createHmac, hkdfSync, randomBytes } from "node:crypto";

const VERSION = "v1";

let cachedKey: Buffer | null = null;
let cachedHmacKey: Buffer | null = null;

function getKey(): Buffer {
  if (cachedKey) return cachedKey;
  const b64 = process.env.ENCRYPTION_KEY;
  if (!b64) {
    throw new Error("ENCRYPTION_KEY is required (32-byte base64) to encrypt license key codes.");
  }
  const key = Buffer.from(b64, "base64");
  if (key.length !== 32) {
    throw new Error("ENCRYPTION_KEY must decode to exactly 32 bytes (256-bit).");
  }
  cachedKey = key;
  return key;
}

// HMAC key for code_hash, derived from ENCRYPTION_KEY via HKDF with a distinct info label,
// so a single env secret covers both encryption and the dedup hash.
function getHmacKey(): Buffer {
  if (cachedHmacKey) return cachedHmacKey;
  cachedHmacKey = Buffer.from(
    hkdfSync("sha256", getKey(), Buffer.alloc(0), Buffer.from("code-hash"), 32)
  );
  return cachedHmacKey;
}

/** Encrypt a license key code into a versioned string `v1:<iv_b64>:<tag_b64>:<ct_b64>`. */
export function encryptCode(plaintext: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", getKey(), iv);
  const ct = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${VERSION}:${iv.toString("base64")}:${tag.toString("base64")}:${ct.toString("base64")}`;
}

/** Decrypt a versioned `v1:...` string back to the original plaintext code. */
export function decryptCode(encoded: string): string {
  const parts = encoded.split(":");
  if (parts.length !== 4 || parts[0] !== VERSION) {
    throw new Error("Unrecognized encrypted code format");
  }
  const iv = Buffer.from(parts[1], "base64");
  const tag = Buffer.from(parts[2], "base64");
  const ct = Buffer.from(parts[3], "base64");
  const decipher = createDecipheriv("aes-256-gcm", getKey(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ct), decipher.final()]).toString("utf8");
}

/**
 * Decrypt a stored code without throwing.
 *
 * Read paths call this so a single bad row never 500s an entire endpoint:
 * - legacy plaintext rows (no `v1:` prefix) are returned as-is;
 * - rows that are encrypted but fail authentication (different ENCRYPTION_KEY
 *   or corruption) return `null` and log a warning so the misconfig is visible.
 */
export function safeDecryptCode(encoded: string): string | null {
  if (!isEncrypted(encoded)) return encoded;
  try {
    return decryptCode(encoded);
  } catch (err) {
    console.warn(
      `[crypto] failed to decrypt license key code (wrong ENCRYPTION_KEY or corrupt row): ${
        err instanceof Error ? err.message : String(err)
      }`
    );
    return null;
  }
}

/** HMAC-SHA256 of a plaintext code (hex), used for dedup since ciphertext is non-deterministic. */
export function hashCode(plaintext: string): string {
  return createHmac("sha256", getHmacKey()).update(plaintext, "utf8").digest("hex");
}

// ─── Binary blob encryption (chat attachments) ────────────────────────────────
// Same AES-256-GCM key as the license codes, but a compact binary container so we can store the
// raw bytes in MinIO. Layout: [1-byte version][12-byte iv][16-byte tag][ciphertext].
const BYTES_VERSION = 0x01;

/** Encrypt an arbitrary byte buffer (e.g. a chat attachment) into the versioned binary container. */
export function encryptBytes(plaintext: Buffer): Buffer {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", getKey(), iv);
  const ct = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([Buffer.from([BYTES_VERSION]), iv, tag, ct]);
}

// Header is exactly 29 bytes (1 version + 12 iv + 16 tag); an encrypted blob is therefore always
// >= 29 bytes, with the empty-plaintext case landing exactly on the boundary.
const BYTES_HEADER_LEN = 29;

/** True if a stored blob carries our binary encryption header. */
export function isEncryptedBlob(blob: Buffer): boolean {
  return blob.length >= BYTES_HEADER_LEN && blob[0] === BYTES_VERSION;
}

/**
 * Decrypt a binary container produced by {@link encryptBytes}.
 * Legacy plaintext blobs (uploaded before attachment encryption) lack the header and are returned
 * unchanged, so old attachments keep rendering.
 */
export function decryptBytes(blob: Buffer): Buffer {
  if (!isEncryptedBlob(blob)) return blob;
  const iv = blob.subarray(1, 13);
  const tag = blob.subarray(13, 29);
  const ct = blob.subarray(29);
  const decipher = createDecipheriv("aes-256-gcm", getKey(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ct), decipher.final()]);
}

/** True if a stored value is already in the encrypted `v1:` form. */
export function isEncrypted(value: string): boolean {
  return value.startsWith(`${VERSION}:`);
}
