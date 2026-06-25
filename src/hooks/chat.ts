"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { backend } from "@/lib/backend";
import { postSigned } from "@/lib/auth/signed-request";
import useProfileStore from "@/stores/profile";
import { isEnvelope } from "@/lib/crypto/ecies";
import { buildEnvelope, openEnvelope } from "@/lib/crypto/message-envelope";
import type { ChatDetail, ChatMessage } from "@/lib/backend/query-chat-types";

export type { ChatDetail };
export type { ChatMessage } from "@/lib/backend/query-chat-types";

export type AttachmentMeta = {
  key: string;
  name: string;
  contentType: string;
  size: number;
};

/**
 * Decrypt the E2E messages in a chat using the in-memory private key. System and legacy
 * (non-envelope) messages are passed through unchanged. Shared by the user chat hook and
 * the admin chat viewer so both decrypt identically.
 */
export async function decryptChatMessages(
  messages: ChatMessage[],
  privateKey: string | undefined
): Promise<ChatMessage[]> {
  if (!privateKey) return messages;
  return Promise.all(
    messages.map(async (m) => {
      if (m.isSystem || !isEnvelope(m.message) || !m.wrappedCek || !m.wrapperPubkey) {
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
        return { ...m, message: "[impossibile decifrare]" };
      }
    })
  );
}

export function useChat(chatId: number | null) {
  const privateKey = useProfileStore((s) => s.account?.privateKey);
  return useQuery({
    queryKey: ["chat", chatId, privateKey],
    queryFn: async (): Promise<ChatDetail> => {
      const { data } = await backend.get<ChatDetail>(`/chat/${chatId}`);
      const messages = await decryptChatMessages(data.messages, privateKey);
      return { ...data, messages };
    },
    enabled: typeof chatId === "number" && chatId > 0,
    // Poll for new messages while the chat is open; stop once it is closed.
    refetchInterval: (query) => (query.state.data?.status === "closed" ? false : 10000),
  });
}

export function useUploadChatAttachment(chatId: number) {
  return useMutation({
    mutationFn: async (file: File): Promise<AttachmentMeta> => {
      const formData = new FormData();
      formData.append("file", file);
      const response = await backend.post<AttachmentMeta>(`/chat/${chatId}/attachment`, formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      return response.data;
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
      if (!account) throw new Error("Wallet non disponibile");
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

      return postSigned(`/chat/${chatId}/message`, body, account.privateKey);
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
      if (!privateKey) throw new Error("Wallet non disponibile");
      return postSigned("/chat", payload, privateKey);
    },
    onSuccess: (_data, variables) => {
      void queryClient.invalidateQueries({
        queryKey: ["orders", "detail", variables.orderId],
      });
    },
  });
}
