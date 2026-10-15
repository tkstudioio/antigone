# E2E encryption of chat messages

The **text** of chat messages is encrypted end-to-end toward the buyer's and seller's pubkeys (ECIES:
ECDH secp256k1 → HKDF-SHA256 → AES-256-GCM, `src/lib/crypto/ecies.ts` + `message-envelope.ts`,
isomorphic). The server **never sees** the plaintext nor any private key. For the chat endpoints see
[account/chat.md](../account/chat.md) (buyer↔seller) and [admin.md](../admin.md) (admin read access).

> The same envelope scheme (`buildEnvelope` / `openEnvelope` / `rewrapCekForRecipient`) is shared with
> **license key codes**, which use `KeyCodeKey` instead of `MessageKey` (seller → buyer → arbiter
> wraps): see [at-rest.md](./at-rest.md).

## Envelope and `MessageKey`

The client builds an envelope: a single random **CEK** encrypts the content, then the CEK is
**wrapped once per recipient**. It sends `{ ciphertext, keys: [{ recipientPubkey, wrappedCek }] }`;
the server saves:

- `Message.message = ciphertext` (`v1:...`) for user/admin messages; it stays **plaintext** for
  `isSystem` messages;
- one `MessageKey` row per recipient (`recipientPubkey`, `wrapperPubkey` = sender set server-side,
  `wrappedCek`).

On read, `GET /api/chat/[id]` returns the ciphertext and **only** the requester's `MessageKey`; the
client decrypts with the privkey in memory (`useChat` → `decryptChatMessages`). `isSystem` messages
and historical pre-encryption ones stay in cleartext (the client decrypts only the `v1:` envelopes).

## Admin access — `grant-admin`

By default the admin **cannot** decrypt the messages. When a party opens the dispute
(`useOpenDispute`), the client re-encrypts the CEK of each still-encrypted message toward the admin
pubkey and sends it to `POST /api/chat/[id]/grant-admin`, which:

- resolves the admin pubkey **server-side** (never from the client);
- `upsert`s the `MessageKey` rows with `recipientPubkey = adminPubkey`.

Since every message is wrapped both for the buyer and the seller, **a single party** can unlock the
entire history. The admin still sees the total message count → selective omissions are detectable. An
order without `arbiterPubkey` (legacy) gives no admin visibility. The admin decrypts client-side with
its own privkey (`useAdminChat` → `decryptChatMessages`).

## Messages sent during the dispute

`grant-admin` only covers the history **existing at the moment of opening**. For subsequent messages,
the buyer/seller composer (`useSendChatMessage` with `adminPubkey` passed from `OrderChatThread`)
wraps the CEK **toward the admin pubkey too**, so the admin decrypts them without a new `grant-admin`.
Without this, post-dispute messages would have the `MessageKey` only for buyer/seller and the admin
would see them as raw `v1:` ciphertext. The admin's messages (`admin-message`) are already wrapped
toward buyer + seller + admin.

## Authorship and ordering

Encryption hides the content; it does not prove who wrote a message or that none was dropped. Every
message is therefore also a **signed action** (`POST /api/chat/[id]/message` / `admin-message`) linked
to its `Message` row, whose signed body carries `prevHash` (the hash of the previous message's signed
action, or the chat genesis hash): the browser verifies each message's author and signature and the
unbroken chain before decrypting it. Details, rendering states and limits in
[verification.md](./verification.md).

> **Requirement**: the admin must be logged in with the identity whose pubkey is `ADMIN_PUBKEY`, so
> that the privkey in the browser's memory matches the `arbiterPubkey` used as recipient. The server
> only ever knows the public key; decryption happens client-side.

> The **authorization** gate (who can read/write chat, attachments and key codes based on the dispute
> status) is in [admin.md](../admin.md) (`src/lib/backend/dispute-access.ts`). Here we describe only
> the cryptographic mechanics.
