# Encryption at rest

Two categories of data are encrypted at rest with **AES-256-GCM** server-side (same `ENCRYPTION_KEY`,
32 bytes base64, server-only env): the **license key codes** and the **chat attachments**. Container
in `src/lib/crypto/symmetric.ts` (`encrypt`/`decrypt` for strings, `encryptBytes`/`decryptBytes` for
binaries). It protects against a leak of the DB / storage, **not** against a compromised application
server.

## License key codes

`Key.code` is stored encrypted in the format `v1:<iv>:<tag>:<ciphertext>`; `Key.code_hash` is an HMAC
of the plaintext used for **deduplication** on upload.

- **Write** (`upsertStockKeys`, see [account/stocks.md](../account/stocks.md)): encrypts the code and
  stores the `code_hash` HMAC for dedup.
- **Read** (`queryStockTier`, `query-orders`): decrypts server-side via `safeDecryptCode` before
  returning the code to an authorized seller/buyer/admin (the visibility rules are in the respective
  domains; for the admin the gate is in [admin.md](../admin.md)).

Decryption is **fault-tolerant**: a legacy cleartext row is returned as-is; an encrypted row that does
not authenticate (e.g. `ENCRYPTION_KEY` different from the one used on write, or a corrupted row)
returns `code: null` and logs a warning, instead of making the whole endpoint fail with a 500.

## Chat attachments (MinIO)

Chat image attachments are **encrypted at rest** before landing on MinIO: the bucket contains only
ciphertext. Storage client in `src/lib/storage/minio.ts`:

- `putChatObject` → key `chat/{chatId}/{uuid}.{ext}`, encrypts with `encryptBytes`;
- `getChatObject` → GET + server-side decryption.

The **download is proxied** by the app exclusively via `GET /api/chat/[id]/attachment/[messageId]`:
the server downloads the ciphertext from MinIO, decrypts it with `getChatObject` and proxies the
cleartext bytes — **no presigned URL**. Legacy plaintext objects (pre-encryption) are returned
unchanged (`decryptBytes` passes through blobs without a header).

> `GET /api/images/[...key]` is the **public proxy** for product images (plaintext, no
> authentication, no decryption) and rejects with **404** any key under the `chat/` prefix — it
> cannot be used to serve chat/dispute attachments.

The S3 client is built from the `MINIO_*` env vars with `forcePathStyle: true`; if they are missing at
runtime the involved endpoint responds 500. The upload does **not** create the message: it returns the
metadata (`{ key, name, contentType, size }`), then the signed/admin message references them. An
upload without a subsequent message leaves an **orphan** file on MinIO (no garbage collection in this
iteration).

> Attachment constraints (MIME, size) and the UI flow are in [account/chat.md](../account/chat.md) and
> [admin.md](../admin.md).
