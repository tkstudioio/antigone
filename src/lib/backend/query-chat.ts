import "server-only";

import { db } from "@/db";
import type { Prisma } from "@prisma/client";
import { CHAT_CHAIN_CONFLICT_MESSAGE, chatGenesisHash } from "@/lib/chat-chain";
import { signedActionHash } from "@/lib/auth/verify-signed-action";
import type { EscrowStatus } from "@/lib/escrow-status";
import { SIGNED_ACTION_SELECT, toSignedActionRecord } from "./signed-action-record";
import type { ChatDetail, ChatMessage } from "./query-chat-types";

export type { ChatDetail, ChatMessage };

/** Prisma `include` that loads a message with its keys and the signed action behind it. */
export const MESSAGE_INCLUDE = {
  keys: true,
  signedAction: { select: SIGNED_ACTION_SELECT },
} satisfies Prisma.MessageInclude;

type MessageRow = Prisma.MessageGetPayload<{ include: typeof MESSAGE_INCLUDE }>;

/**
 * Serialize a message for one viewer: ciphertext + the viewer's own wrapped content key + the signed
 * action the client must verify. `viewerPubkey` selects which `MessageKey` row is exposed.
 */
export function toChatMessage(m: MessageRow, chatId: number, viewerPubkey: string): ChatMessage {
  const myKey = m.keys.find((k) => k.recipientPubkey === viewerPubkey) ?? null;
  return {
    id: m.id,
    action: toSignedActionRecord(m.signedAction),
    senderPubkey: m.senderPubkey,
    message: m.message,
    isSystem: m.isSystem ?? false,
    sentAt: m.sentAt.toISOString(),
    attachment:
      m.attachmentKey != null
        ? {
            name: m.attachmentName ?? "",
            contentType: m.attachmentType ?? "",
            size: m.attachmentSize ?? 0,
            url: `/api/chat/${chatId}/attachment/${m.id}`,
          }
        : null,
    wrappedCek: myKey?.wrappedCek ?? null,
    wrapperPubkey: myKey?.wrapperPubkey ?? null,
  };
}

// ─── findOrderForChat ─────────────────────────────────────────────────────────

type OrderForChatResult =
  | {
      ok: true;
      order: {
        id: number;
        buyerPubkey: string;
        sellerPubkey: string;
        status: string;
        escrowStatus: EscrowStatus | undefined;
      };
    }
  | { ok: false; notFound: true }
  | { ok: false; forbidden: true };

export async function findOrderForChat(params: {
  pubkey: string;
  orderId: number;
}): Promise<OrderForChatResult> {
  const { pubkey, orderId } = params;

  const order = await db.order.findUnique({
    where: { id: orderId },
    select: { id: true, buyerPubkey: true, sellerPubkey: true, status: true, escrowAddress: true },
  });

  if (!order) return { ok: false, notFound: true };

  if (order.buyerPubkey !== pubkey && order.sellerPubkey !== pubkey) {
    return { ok: false, forbidden: true };
  }

  const escrow = order.escrowAddress
    ? await db.escrow.findUnique({
        where: { address: order.escrowAddress },
        select: { status: true },
      })
    : null;

  return {
    ok: true,
    order: {
      id: order.id,
      buyerPubkey: order.buyerPubkey,
      sellerPubkey: order.sellerPubkey,
      status: order.status,
      escrowStatus: escrow?.status as EscrowStatus | undefined,
    },
  };
}

// ─── findChatByOrderId ────────────────────────────────────────────────────────

export async function findChatByOrderId(orderId: number) {
  return db.chat.findUnique({ where: { orderId } });
}

// ─── createChatForOrder ───────────────────────────────────────────────────────

export async function createChatForOrder(params: { orderId: number; signature: string }) {
  const { orderId, signature } = params;
  return db.chat.create({
    data: { orderId, signature, status: "open" },
  });
}

// ─── queryChatDetail ──────────────────────────────────────────────────────────

export async function queryChatDetail(params: {
  pubkey: string;
  chatId: number;
}): Promise<ChatDetail | null> {
  const { pubkey, chatId } = params;

  const chat = await db.chat.findUnique({
    where: { id: chatId },
    include: {
      order: { select: { buyerPubkey: true, sellerPubkey: true } },
      // Creation order (ids are monotonic): the per-chat hash chain is verified in this order.
      messages: {
        orderBy: { id: "asc" },
        include: {
          keys: { where: { recipientPubkey: pubkey } },
          signedAction: { select: SIGNED_ACTION_SELECT },
        },
      },
    },
  });

  if (!chat) return null;

  const { buyerPubkey, sellerPubkey } = chat.order;

  if (pubkey !== buyerPubkey && pubkey !== sellerPubkey) {
    return null;
  }

  const messages: ChatMessage[] = chat.messages.map((m) => toChatMessage(m, chat.id, pubkey));

  return {
    id: chat.id,
    status: chat.status,
    orderId: chat.orderId,
    buyerPubkey,
    sellerPubkey,
    createdAt: chat.createdAt.toISOString(),
    messages,
  };
}

// ─── createMessage ────────────────────────────────────────────────────────────

const CHAIN_MISMATCH_ERROR = CHAT_CHAIN_CONFLICT_MESSAGE;

/**
 * Persist a signed chat message, enforcing the per-chat hash chain: `prevHash` (inside the signed
 * body) must be the hash of the signed action of the current tail, or the chat genesis hash when no
 * signed message exists yet. A stale tail answers 409 (the client refetches and retries); the
 * `(chatId, prevHash)` unique index makes the check race-proof — two concurrent sends cannot both
 * extend the same tail.
 */
export async function createMessage(params: {
  chatId: number;
  senderPubkey: string;
  ciphertext?: string;
  keys?: { recipientPubkey: string; wrappedCek: string }[];
  /** The message's signature (kept in `Message.signature`). */
  signature: string;
  /** The persisted signed action this message is created from. */
  actionId: number;
  /** The `prevHash` the sender signed. */
  prevHash: string;
  attachment?: {
    key: string;
    name: string;
    contentType: string;
    size: number;
  };
}): Promise<{ ok: true; message: MessageRow } | { error: string; status: number }> {
  const { chatId, senderPubkey, ciphertext, keys, signature, actionId, prevHash, attachment } =
    params;

  const tail = await db.message.findFirst({
    where: { chatId, signedActionId: { not: null } },
    orderBy: { id: "desc" },
    select: { signedAction: { select: SIGNED_ACTION_SELECT } },
  });
  const tailRecord = toSignedActionRecord(tail?.signedAction);
  const expectedPrevHash = tailRecord ? signedActionHash(tailRecord) : chatGenesisHash(chatId);
  if (prevHash !== expectedPrevHash) return { error: CHAIN_MISMATCH_ERROR, status: 409 };

  try {
    const message = await createMessageRow({
      chatId,
      senderPubkey,
      ciphertext,
      keys,
      signature,
      actionId,
      prevHash,
      attachment,
    });
    return { ok: true, message };
  } catch (err) {
    if (typeof err === "object" && err !== null && (err as { code?: unknown }).code === "P2002") {
      return { error: CHAIN_MISMATCH_ERROR, status: 409 };
    }
    throw err;
  }
}

async function createMessageRow(params: {
  chatId: number;
  senderPubkey: string;
  ciphertext?: string;
  keys?: { recipientPubkey: string; wrappedCek: string }[];
  signature: string;
  actionId: number;
  prevHash: string;
  attachment?: {
    key: string;
    name: string;
    contentType: string;
    size: number;
  };
}) {
  const { chatId, senderPubkey, ciphertext, keys, signature, actionId, prevHash, attachment } =
    params;
  return db.message.create({
    data: {
      chatId,
      senderPubkey,
      message: ciphertext ?? null,
      signature,
      signedActionId: actionId,
      prevHash,
      isSystem: false,
      attachmentKey: attachment?.key ?? null,
      attachmentName: attachment?.name ?? null,
      attachmentType: attachment?.contentType ?? null,
      attachmentSize: attachment?.size ?? null,
      // The server sets wrapperPubkey = senderPubkey; it does not trust the client for it.
      keys: keys
        ? {
            create: keys.map((k) => ({
              recipientPubkey: k.recipientPubkey,
              wrapperPubkey: senderPubkey,
              wrappedCek: k.wrappedCek,
            })),
          }
        : undefined,
    },
    include: MESSAGE_INCLUDE,
  });
}

// ─── grantAdminAccess ─────────────────────────────────────────────────────────

/**
 * Upsert admin MessageKey rows so the platform admin can decrypt a chat during a dispute.
 * Authorized for the buyer/seller of the chat's order; the admin pubkey is resolved by the
 * caller (server-side), never trusted from the client.
 */
export async function grantAdminAccess(params: {
  chatId: number;
  pubkey: string; // the requesting party (buyer or seller)
  adminPubkey: string;
  keys: { messageId: number; wrappedCek: string; wrapperPubkey: string }[];
}): Promise<{ ok: true } | { error: string; status: number }> {
  const { chatId, pubkey, adminPubkey, keys } = params;

  const chat = await db.chat.findUnique({
    where: { id: chatId },
    include: { order: { select: { buyerPubkey: true, sellerPubkey: true } } },
  });
  if (!chat) return { error: "Chat non trovata", status: 404 };
  if (pubkey !== chat.order.buyerPubkey && pubkey !== chat.order.sellerPubkey) {
    return { error: "Accesso non autorizzato", status: 403 };
  }

  // Only accept keys for messages that belong to this chat.
  const validIds = new Set(
    (await db.message.findMany({ where: { chatId }, select: { id: true } })).map((m) => m.id)
  );

  await db.$transaction(
    keys
      .filter((k) => validIds.has(k.messageId))
      .map((k) =>
        db.messageKey.upsert({
          where: { uq_message_recipient: { messageId: k.messageId, recipientPubkey: adminPubkey } },
          create: {
            messageId: k.messageId,
            recipientPubkey: adminPubkey,
            wrapperPubkey: k.wrapperPubkey,
            wrappedCek: k.wrappedCek,
          },
          update: { wrappedCek: k.wrappedCek, wrapperPubkey: k.wrapperPubkey },
        })
      )
  );

  return { ok: true };
}
