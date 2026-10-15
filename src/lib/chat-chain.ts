import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex } from "@noble/hashes/utils.js";
import {
  samePubkey,
  signedActionHash,
  verifySignedAction,
  type SignedActionRecord,
} from "@/lib/auth/verify-signed-action";
import { adminMessageSchema, postChatMessageSchema } from "@/validators";

/**
 * Per-chat hash chain over the signed chat messages. Isomorphic: the server uses
 * {@link signedActionHash} to enforce the tail on send, the browser uses everything here to verify
 * what it reads.
 *
 * Every chat message is a signed action whose signed body carries `prevHash` = the
 * {@link signedActionHash} of the previous message's action in the same chat, or
 * {@link chatGenesisHash} for the first one. A server that removes or reorders a message breaks the
 * link of the message after the gap, and it cannot repair it: it would need the author's signature.
 * (Dropping the LAST messages is not detectable — nothing follows them.)
 *
 * System messages are written by the platform, are unsigned, and are not part of the chain.
 */

/**
 * Error text of the 409 the server answers when a message's signed `prevHash` is not the current
 * tail. The client recognises it, refetches the chat and signs the message again.
 */
export const CHAT_CHAIN_CONFLICT_MESSAGE =
  "The conversation changed: reload it and send the message again";

/** The `prevHash` of the first message of a chat; binds the chain to the chat id. */
export function chatGenesisHash(chatId: number): string {
  return bytesToHex(sha256(new TextEncoder().encode(`antigone:chat-genesis:v1:${chatId}`)));
}

/** The chat message as the verifier needs it (a subset of the API `ChatMessage`). */
export type ChainMessageInput = {
  id: number;
  senderPubkey: string | null;
  isSystem: boolean;
  action: SignedActionRecord | null;
};

/** Who may author messages in a chat. The arbiter may be unknown (no dispute / not trusted). */
export type ChatParties = {
  buyerPubkey: string;
  sellerPubkey: string;
  arbiterPubkey: string | null;
};

/** The signed payload of a chat message, as verified. */
export type VerifiedChatBody = {
  prevHash: string;
  ciphertext?: string;
  keys?: { recipientPubkey: string; wrappedCek: string }[];
  attachment?: { key: string; name: string; contentType: string; size: number };
};

export type ChatMessageVerification =
  /** Platform-authored (unsigned): cannot be verified by design. */
  | { status: "system" }
  /** No signed action, positioned before the first signed message: pre-signing data. */
  | { status: "legacy" }
  | { status: "verified"; body: VerifiedChatBody; gapBefore: boolean }
  | { status: "tampered"; reason: string; gapBefore: boolean };

export type ChatVerification = {
  /** Result per message id. */
  results: Map<number, ChatMessageVerification>;
  /** `prevHash` the next message of this chat must carry (hash of the last signed action). */
  tailPrevHash: string;
  /** True when at least one gap was detected. */
  hasGap: boolean;
};

function expectedPath(chatId: number, role: "user" | "arbiter"): string {
  return role === "user" ? `/api/chat/${chatId}/message` : `/api/chat/${chatId}/admin-message`;
}

/**
 * The `prevHash` for the next message after `messages` (the last message that carries a signed
 * action, whatever its verification outcome — a sender cannot judge it any better), or the genesis.
 */
export function nextPrevHash(
  chatId: number,
  messages: ReadonlyArray<Pick<ChainMessageInput, "action" | "isSystem">>
): string {
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i]!;
    if (!m.isSystem && m.action) return signedActionHash(m.action);
  }
  return chatGenesisHash(chatId);
}

/**
 * Verify every message of a chat (in the order the server returned them): authorship against the
 * EXPECTED parties, the signature, the endpoint, and the unbroken `prevHash` chain.
 */
export function verifyChatMessages(params: {
  chatId: number;
  parties: ChatParties;
  messages: readonly ChainMessageInput[];
}): ChatVerification {
  const { chatId, parties, messages } = params;
  const results = new Map<number, ChatMessageVerification>();

  let prev = chatGenesisHash(chatId);
  let seenSigned = false;
  let hasGap = false;

  for (const m of messages) {
    if (m.isSystem) {
      results.set(m.id, { status: "system" });
      continue;
    }

    if (!m.action) {
      // Before the first signed message this is pre-signing data; afterwards an unsigned message
      // cannot have been written through the API (it would carry an action): a forged row.
      results.set(
        m.id,
        seenSigned
          ? { status: "tampered", reason: "The message is not signed", gapBefore: false }
          : { status: "legacy" }
      );
      continue;
    }

    seenSigned = true;
    const actionHash = signedActionHash(m.action);
    const sender = m.senderPubkey;

    const isParty =
      samePubkey(sender, parties.buyerPubkey) || samePubkey(sender, parties.sellerPubkey);
    const isArbiter = !isParty && samePubkey(sender, parties.arbiterPubkey);

    if (!sender || (!isParty && !isArbiter)) {
      results.set(m.id, {
        status: "tampered",
        reason: "The sender is not a participant of this order",
        gapBefore: false,
      });
      prev = actionHash;
      continue;
    }

    const verified = isParty
      ? verifySignedAction(
          m.action,
          { pubkey: sender, path: expectedPath(chatId, "user") },
          postChatMessageSchema
        )
      : verifySignedAction(
          m.action,
          { pubkey: sender, path: expectedPath(chatId, "arbiter") },
          adminMessageSchema
        );

    if (!verified.ok) {
      results.set(m.id, { status: "tampered", reason: verified.message, gapBefore: false });
      prev = actionHash;
      continue;
    }

    const body = verified.body as VerifiedChatBody & { chatId?: number };
    if (isParty && body.chatId !== chatId) {
      results.set(m.id, {
        status: "tampered",
        reason: "The message was signed for a different chat",
        gapBefore: false,
      });
      prev = actionHash;
      continue;
    }

    const gapBefore = body.prevHash !== prev;
    if (gapBefore) hasGap = true;
    results.set(m.id, { status: "verified", body, gapBefore });
    prev = actionHash;
  }

  return { results, tailPrevHash: prev, hasGap };
}
