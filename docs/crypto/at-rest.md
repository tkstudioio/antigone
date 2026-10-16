# Encryption at rest

Two categories of confidential data, protected in two different ways:

- **License key codes** are **end-to-end encrypted** in the browser (same envelope scheme as the chat,
  see [messaging.md](./messaging.md)). The server stores only ciphertext and per-recipient wrapped
  keys: **there is no server-side key that can read a code**, so a malicious or compromised host cannot
  read or steal the goods.
- **Chat attachments** are encrypted at rest with **AES-256-GCM server-side** (`ENCRYPTION_KEY`, 32 bytes
  base64, server-only env; `encryptBytes`/`decryptBytes` in `src/lib/crypto/symmetric.ts`). That only
  protects against a leak of the DB / storage, **not** against a compromised application server
  (E2E attachments are a roadmap follow-up).

## License key codes (E2E)

Code in `src/lib/crypto/code-envelope.ts` (isomorphic, a thin layer over `message-envelope.ts`:
`buildEnvelope`, `openEnvelope`, `rewrapCekForRecipient`). Plaintext codes and private keys only ever
exist in the browser.

`Key.code` holds the **ciphertext** (`v1:<iv>:<ciphertext>`, the ECIES/AES-GCM sealed format of
`ecies.ts`) of a single envelope: one content ciphertext under a random CEK. The CEK is wrapped **once
per recipient** in a `KeyCodeKey` row (`keyId`, `recipientPubkey`, `wrapperPubkey`, `wrappedCek`;
unique `(keyId, recipientPubkey)`; cascades with the `Key`). `wrapperPubkey` is the ECDH counterpart the
recipient needs to unwrap and is **always set server-side** to the signer.

| Step     | Who / where                                                         | What happens                                                                                                                                                                   |
| -------- | ------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Upload   | Seller's browser → `POST /api/stocks`                               | Trim + dedup, encrypt each code into an envelope **addressed to the seller only**, compute the dedup hash. The server stores `Key.code` + one seller `KeyCodeKey` per key.     |
| Delivery | Seller's browser → `POST /api/orders/[id]/confirm` (or `/deliver`)  | Unwrap each key's CEK and re-wrap it toward the buyer (`rewrapCekForRecipient`). The server requires **exactly one wrap per order key**, all for the buyer, and stores them.   |
| Dispute  | Either party's browser → `POST /api/orders/[id]/grant-arbiter-keys` | Re-wrap the CEKs the party can open toward the escrow arbiter (`ADMIN_PUBKEY`). Dispute only; callable again while the dispute lasts.                                          |
| Read     | Seller / buyer / admin browser                                      | The API returns `{ ciphertext, wrappedCek, wrapperPubkey }` for the caller's own `KeyCodeKey`; the browser decrypts (`openStoredCode`), same pattern as `decryptChatMessages`. |

### Dedup hash (`Key.code_hash`)

`code_hash` = HMAC-SHA256 (hex) of the trimmed code, keyed by a secret derived with **HKDF from the
seller's private key** (info `antigone/code-dedup/v1`, `computeCodeHash`). It is computed **client-side**
and the server cannot brute-force short codes from it. It is per seller: dedup is on
`(sellerPubkey, productId, codeHash)` (cross-seller detection is intentionally not provided).

### Who can open a code

- **Seller**: always, for the keys they uploaded (own `KeyCodeKey`).
- **Buyer**: only after delivery (a buyer `KeyCodeKey` exists) **and** once the key is assigned to them
  (`Key.buyerPubkey`, set at confirmation or by a verdict that retains the key). Before that the API
  returns no ciphertext and the UI shows `—`.
- **Arbiter (admin)**: only once a dispute party granted it (`grant-arbiter-keys`), and only while the
  dispute gate is open (`mayAdminReadOrder`, see [admin.md](../admin.md)). Otherwise the dispute
  detail shows «Not shared with the arbiter yet».

### Failure modes

- A wrap that does not open (corrupt row, or a malicious seller delivering garbage) never throws: the
  UI shows «Unable to decrypt — open a dispute». The seller's signed confirm request
  (`SignedAction`, which now stores the ciphertext-only body) is the evidence.
- A locked wallet (no private key in memory) blocks upload / confirm / deliver («Wallet unavailable»).
- Legacy rows encrypted with the old server-side key (`v1:<iv>:<tag>:<ct>`, 4 parts) are **not readable
  anymore** (the UI shows `—`); they are development data to wipe with `pnpm db:anti-seed`. The
  server-side code helpers (`encryptCode`, `hashCode`, `safeDecryptCode`) and the backfill script were
  removed.

## Chat attachments (S3 bucket)

Chat image attachments are **encrypted at rest** before landing on the S3 bucket, which contains only
ciphertext. Storage client in `src/lib/storage/s3.ts`:

- `putChatObject` → key `chat/{chatId}/{uuid}.{ext}`, encrypts with `encryptBytes`;
- `getChatObject` → GET + server-side decryption.

The **download is proxied** by the app exclusively via `GET /api/chat/[id]/attachment/[messageId]`:
the server downloads the ciphertext from the bucket, decrypts it with `getChatObject` and proxies the
cleartext bytes — **no presigned URL**. Legacy plaintext objects (pre-encryption) are returned
unchanged (`decryptBytes` passes through blobs without a header).

> `GET /api/images/[...key]` is the **public proxy** for product images (plaintext, no
> authentication, no decryption) and rejects with **404** any key under the `chat/` prefix — it
> cannot be used to serve chat/dispute attachments.

The S3 client is built from the `S3_*` env vars with `forcePathStyle: true` (MinIO locally, Cloudflare R2 on Vercel); if they are missing at
runtime the involved endpoint responds 500. The upload does **not** create the message: it returns the
metadata (`{ key, name, contentType, size }`), then the signed/admin message references them. An
upload without a subsequent message leaves an **orphan** object in the bucket (no garbage collection in this
iteration).

> Attachment constraints (MIME, size) and the UI flow are in [account/chat.md](../account/chat.md) and
> [admin.md](../admin.md).
