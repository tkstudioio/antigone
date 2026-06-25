/**
 * Shared chat types — no server-only import, safe to use in client hooks.
 */

export type ChatMessageAttachment = {
  name: string;
  contentType: string;
  size: number;
  /** Same-origin path: /api/chat/{chatId}/attachment/{messageId} */
  url: string;
};

export type ChatMessage = {
  id: number;
  senderPubkey: string | null;
  /** Ciphertext for user messages (ECIES `v1:...`), plaintext for system/legacy messages. */
  message: string | null;
  isSystem: boolean;
  sentAt: string;
  attachment: ChatMessageAttachment | null;
  /** The requester's wrapped CEK + the wrapper pubkey to unwrap it (null for system/legacy). */
  wrappedCek: string | null;
  wrapperPubkey: string | null;
};

export type ChatDetail = {
  id: number;
  status: string;
  orderId: number;
  buyerPubkey: string;
  sellerPubkey: string;
  createdAt: string;
  messages: ChatMessage[];
};
