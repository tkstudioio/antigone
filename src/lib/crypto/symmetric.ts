// NOTE: intentionally NOT `import "server-only"`. This module uses node:crypto +
// process.env, so it cannot run in a browser bundle anyway, and it is imported by
// tsx-run scripts where the `server-only` marker throws.
//
// Server-side AES-256-GCM at rest, used ONLY for chat attachments (MinIO). License codes are NOT
// handled here: they are end-to-end encrypted in the browser (see `code-envelope.ts`), so the server
// holds no key that can read them.
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

let cachedKey: Buffer | null = null;

function getKey(): Buffer {
  if (cachedKey) return cachedKey;
  const b64 = process.env.ENCRYPTION_KEY;
  if (!b64) {
    throw new Error("ENCRYPTION_KEY is required (32-byte base64) to encrypt chat attachments.");
  }
  const key = Buffer.from(b64, "base64");
  if (key.length !== 32) {
    throw new Error("ENCRYPTION_KEY must decode to exactly 32 bytes (256-bit).");
  }
  cachedKey = key;
  return key;
}

// ─── Binary blob encryption (chat attachments) ────────────────────────────────
// Compact binary container so we can store the raw bytes in MinIO.
// Layout: [1-byte version][12-byte iv][16-byte tag][ciphertext].
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
