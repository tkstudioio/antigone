"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { backend } from "@/lib/backend";
import { postSigned, uploadSigned } from "@/lib/auth/signed-request";
import useProfileStore from "@/stores/profile";
import { isEnvelope } from "@/lib/crypto/ecies";
import { buildEnvelope, openEnvelope } from "@/lib/crypto/message-envelope";
import {
  CHAT_CHAIN_CONFLICT_MESSAGE,
  nextPrevHash,
  verifyChatMessages,
  type ChatMessageVerification,
  type ChatParties,
} from "@/lib/chat-chain";
import type { ChatDetail, ChatMessage } from "@/lib/backend/query-chat-types";

export type { ChatDetail };
export type { ChatMessage } from "@/lib/backend/query-chat-types";
export type { ChatParties } from "@/lib/chat-chain";

export type AttachmentMeta = {
  key: string;
  name: string;
  contentType: string;
  size: number;
};

/** A chat message after verification: `verification` says how far it can be trusted. */
export type VerifiedChatMessage = ChatMessage & { verification: ChatMessageVerification };

/** A chat after verification (signatures + hash chain) and decryption. */
export type VerifiedChatDetail = Omit<ChatDetail, "messages"> & {
  messages: VerifiedChatMessage[];
  /** `prevHash` the next message must carry. */
  tailPrevHash: string;
  /** True when the server removed or reordered at least one message. */
  hasGap: boolean;
};

/**
 * Verify every message of a chat against its sender's signature and the per-chat hash chain, then
 * decrypt what can be trusted with the in-memory private key.
 *
 * Messages are rendered from their SIGNED body (ciphertext, attachment metadata, the viewer's own
 * wrapped key), never from the parallel server fields. A message that fails verification is NOT
 * decrypted nor displayed. System messages (platform-authored, unsigned) and pre-signing legacy
 * messages pass through marked as such. Shared by the user chat hook and the admin chat viewer so
 * both verify and decrypt identically.
 */
export async function verifyAndDecryptChat(params: {
  chat: ChatDetail;
  parties: ChatParties;
  viewerPubkey: string | undefined;
  privateKey: string | undefined;
}): Promise<VerifiedChatDetail> {
  const { chat, parties, viewerPubkey, privateKey } = params;
  const { results, tailPrevHash, hasGap } = verifyChatMessages({
    chatId: chat.id,
    parties,
    messages: chat.messages,
  });

  const messages = await Promise.all(
    chat.messages.map(async (m): Promise<VerifiedChatMessage> => {
      const verification = results.get(m.id) ?? { status: "legacy" as const };

      if (verification.status === "tampered") {
        return { ...m, message: null, attachment: null, wrappedCek: null, verification };
      }
      if (verification.status === "system" || verification.status === "legacy") {
        return { ...(await decryptMessage(m, privateKey)), verification };
      }

      // Verified: take everything from the signed body.
      const { body } = verification;
      const ownWrap = viewerPubkey
        ? body.keys?.find((k) => k.recipientPubkey.toLowerCase() === viewerPubkey.toLowerCase())
        : undefined;
      const fromBody: ChatMessage = {
        ...m,
        message: body.ciphertext ?? null,
        attachment: body.attachment
          ? {
              name: body.attachment.name,
              contentType: body.attachment.contentType,
              size: body.attachment.size,
              url: `/api/chat/${chat.id}/attachment/${m.id}`,
            }
          : null,
        // The viewer's wrap from the signed body when the sender wrapped for them; otherwise the
        // re-wrap a dispute party added later (`grant-admin`), which no signed message carries — a
        // wrong one just fails the authenticated decryption.
        wrappedCek: ownWrap?.wrappedCek ?? m.wrappedCek,
        wrapperPubkey: ownWrap ? (m.action?.pubkey ?? m.wrapperPubkey) : m.wrapperPubkey,
      };
      return { ...(await decryptMessage(fromBody, privateKey)), verification };
    })
  );

  return { ...chat, messages, tailPrevHash, hasGap };
}

async function decryptMessage(
  m: ChatMessage,
  privateKey: string | undefined
): Promise<ChatMessage> {
  if (!privateKey || m.isSystem || !isEnvelope(m.message) || !m.wrappedCek || !m.wrapperPubkey) {
    return m;
  }
  try {
    const plaintext = await openEnvelope({
      recipientPrivHex: privateKey,
      wrapperPubHex: m.wrapperPubkey,
      ciphertext: m.message!,
      wrappedCek: m.wrappedCek,
    });
    return { ...m, message: plaintext };
  } catch {
    return { ...m, message: "[Unable to decrypt]" };
  }
}

/** The parties a chat is verified against: the server's buyer/seller unless the caller knows better. */
function resolveParties(chat: ChatDetail, parties: ChatParties | undefined): ChatParties {
  return (
    parties ?? {
      buyerPubkey: chat.buyerPubkey,
      sellerPubkey: chat.sellerPubkey,
      arbiterPubkey: null,
    }
  );
}

/**
 * Send a signed chat message that extends the chat's hash chain. The tail is read fresh before each
 * attempt; when the server answers that the conversation moved on (409) the chat is refetched and
 * the message is signed again, a couple of times, before giving up.
 */
export async function sendOnChain<T>(params: {
  fetchChat: () => Promise<ChatDetail>;
  send: (prevHash: string) => Promise<T>;
}): Promise<T> {
  const { fetchChat, send } = params;
  for (let attempt = 0; ; attempt++) {
    const chat = await fetchChat();
    const prevHash = nextPrevHash(chat.id, chat.messages);
    try {
      return await send(prevHash);
    } catch (err) {
      const conflict = err instanceof Error && err.message === CHAT_CHAIN_CONFLICT_MESSAGE;
      if (!conflict || attempt >= 2) throw err;
    }
  }
}

/**
 * The buyer/seller chat of an order, verified and decrypted. `parties` should come from the
 * VERIFIED order (buyer, seller, trusted arbiter); without it the server's buyer/seller are used and
 * no arbiter message can be verified.
 */
export function useChat(chatId: number | null, parties?: ChatParties) {
  const privateKey = useProfileStore((s) => s.account?.privateKey);
  const viewerPubkey = useProfileStore((s) => s.account?.pubkey);
  return useQuery({
    queryKey: ["chat", chatId, privateKey, parties?.arbiterPubkey ?? null],
    queryFn: async (): Promise<VerifiedChatDetail> => {
      const { data } = await backend.get<ChatDetail>(`/chat/${chatId}`);
      return verifyAndDecryptChat({
        chat: data,
        parties: resolveParties(data, parties),
        viewerPubkey,
        privateKey,
      });
    },
    enabled: typeof chatId === "number" && chatId > 0,
    // Poll for new messages while the chat is open; stop once it is closed.
    refetchInterval: (query) => (query.state.data?.status === "closed" ? false : 10000),
  });
}

export function useUploadChatAttachment(chatId: number) {
  const privateKey = useProfileStore((s) => s.account?.privateKey);
  return useMutation({
    mutationFn: async (file: File): Promise<AttachmentMeta> => {
      if (!privateKey) throw new Error("Wallet unavailable");
      // Signed raw-bytes upload: the file is the body, its name travels in the (signed) query string.
      return uploadSigned<AttachmentMeta>(
        `/chat/${chatId}/attachment?name=${encodeURIComponent(file.name)}`,
        file,
        privateKey
      );
    },
  });
}

export function useSendChatMessage(
  chatId: number,
  recipients: { buyerPubkey: string; sellerPubkey: string; adminPubkey?: string | null }
) {
  const queryClient = useQueryClient();
  const account = useProfileStore((s) => s.account);

  return useMutation({
    mutationFn: async (payload: { message?: string; attachment?: AttachmentMeta }) => {
      if (!account) throw new Error("Wallet unavailable");
      const body: Record<string, unknown> = { chatId };

      if (payload.message != null) {
        // During a dispute, also wrap the CEK toward the admin so it can read messages sent after
        // the dispute was opened (grant-admin only covers the history that existed at open time).
        const recipientPubkeys = [recipients.buyerPubkey, recipients.sellerPubkey];
        if (recipients.adminPubkey && !recipientPubkeys.includes(recipients.adminPubkey)) {
          recipientPubkeys.push(recipients.adminPubkey);
        }
        const env = await buildEnvelope({
          senderPrivHex: account.privateKey,
          senderPubHex: account.pubkey,
          recipientPubkeys,
          plaintext: payload.message,
        });
        body.ciphertext = env.ciphertext;
        body.keys = env.keys.map((k) => ({
          recipientPubkey: k.recipientPubkey,
          wrappedCek: k.wrappedCek,
        }));
      }
      if (payload.attachment != null) body.attachment = payload.attachment;

      return sendOnChain({
        fetchChat: () => backend.get<ChatDetail>(`/chat/${chatId}`).then((r) => r.data),
        send: (prevHash) =>
          postSigned(`/chat/${chatId}/message`, { ...body, prevHash }, account.privateKey),
      });
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["chat", chatId] });
    },
  });
}

export function useOpenOrderChat() {
  const queryClient = useQueryClient();
  const privateKey = useProfileStore((s) => s.account?.privateKey);

  return useMutation({
    mutationFn: async (payload: { orderId: number }) => {
      if (!privateKey) throw new Error("Wallet unavailable");
      return postSigned("/chat", payload, privateKey);
    },
    onSuccess: (_data, variables) => {
      void queryClient.invalidateQueries({
        queryKey: ["orders", "detail", variables.orderId],
      });
    },
  });
}
