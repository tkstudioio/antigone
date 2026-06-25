# Order chat (buyer ↔ seller)

Endpoints: `src/app/api/chat/route.ts`, `src/app/api/chat/[id]/route.ts`,
`src/app/api/chat/[id]/message/route.ts`. Backend: `src/lib/backend/query-chat.ts`.

The message text is **E2E encrypted** toward buyer and seller, the attachments are **encrypted at
rest**: the cryptographic mechanics (ECIES, `MessageKey`, `grant-admin`, wrapping during a dispute)
are in [crypto/messaging.md](../crypto/messaging.md); attachment encryption in
[crypto/at-rest.md](../crypto/at-rest.md). Admin moderation is in [admin.md](../admin.md).

| Flow               | Endpoint                                    | Notes                                                                                                                                                              |
| ------------------ | ------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Open/fetch chat    | `POST /api/chat`                            | `findOrderForChat` (only the order's buyer/seller) → if it exists, returns it (200), otherwise `createChatForOrder` (`status: open`, 201). One chat per order.     |
| Read chat          | `GET /api/chat/[id]`                        | Visible only to buyer/seller. Returns the ciphertext + the requester's `MessageKey`.                                                                              |
| Send message       | `POST /api/chat/[id]/message`               | Signed; accepts `{ chatId, ciphertext?, keys?, attachment? }`; the envelope must include both buyer and seller (422 otherwise); blocked (409) if the chat is `closed`. |
| Upload attachment  | `POST /api/chat/[id]/attachment`            | Multipart; JPEG/PNG/WebP/GIF images, max 5 MB; returns `{ key, name, contentType, size }`. Encrypted at rest on MinIO.                                            |
| Download attachment | `GET /api/chat/[id]/attachment/[messageId]` | Server-side proxy of the decrypted bytes.                                                                                                                          |

## Image attachments

The composer in `OrderChatThread` exposes an "Attach image" button. Flow: file selection →
MIME/size validation client-side (toast if invalid) → `POST .../attachment` (axios `backend`,
FormData) → `{ key, name, contentType, size }` → sending of the signed message with `attachment`.
Messages with an attachment show a clickable thumbnail in the thread.

Rules:

- Images only: `image/jpeg`, `image/png`, `image/webp`, `image/gif`.
- Maximum size: 5 MB.
- One optional attachment per message; a message must have text (encrypted) or an attachment
  (validated by `postChatMessageSchema` with `.refine()`).
- Signed payload: `{ chatId, ciphertext?, keys?, attachment? }`. The text travels only as
  `ciphertext` (E2E envelope), never in cleartext.
