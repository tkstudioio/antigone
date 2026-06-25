"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { backend } from "@/lib/backend/index";
import { postSigned } from "@/lib/auth/signed-request";
import useProfileStore from "@/stores/profile";
import { buildEnvelope } from "@/lib/crypto/message-envelope";
import { decryptChatMessages } from "@/hooks/chat";
import type { AdminChatsResponse } from "@/lib/backend/query-chats";
import type { ChatDetail } from "@/lib/backend/query-chat-types";
import type { AttachmentMeta } from "@/hooks/chat";
import type { DisputesResponse, OrderDetail } from "@/lib/backend/query-orders";
import { toast } from "react-toastify";

export type { AdminChatsResponse };

export type AdminChatsQuery = {
  page?: number;
  sort?: string;
  dir?: string;
  search?: string;
};

export function useAdminChats(query: AdminChatsQuery) {
  return useQuery({
    queryKey: ["admin-chats", query],
    queryFn: () =>
      backend.get<AdminChatsResponse>("/disputes", { params: query }).then((r) => r.data),
    refetchInterval: 15000,
  });
}

export function useAdminChat(chatId: number | null) {
  const privateKey = useProfileStore((s) => s.account?.privateKey);
  return useQuery({
    queryKey: ["admin-chat", chatId, privateKey],
    queryFn: async (): Promise<ChatDetail> => {
      const { data } = await backend.get<ChatDetail>(`/admin/chat/${chatId}`);
      const messages = await decryptChatMessages(data.messages, privateKey);
      return { ...data, messages };
    },
    enabled: chatId != null,
    // Poll for new messages while the chat is open; stop once it is closed.
    refetchInterval: (q) => (q.state.data?.status === "closed" ? false : 10000),
  });
}

export function useUploadAdminChatAttachment(chatId: number | null) {
  return useMutation({
    mutationFn: async (file: File): Promise<AttachmentMeta> => {
      if (chatId == null) throw new Error("chatId unavailable");
      const formData = new FormData();
      formData.append("file", file);
      const response = await backend.post<AttachmentMeta>(`/chat/${chatId}/attachment`, formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      return response.data;
    },
  });
}

export function useAdminSendMessage(
  chatId: number | null,
  recipients: { buyerPubkey: string; sellerPubkey: string }
) {
  const queryClient = useQueryClient();
  const account = useProfileStore((s) => s.account);

  return useMutation({
    mutationFn: async (payload: { message?: string; attachment?: AttachmentMeta }) => {
      if (!account) throw new Error("Wallet unavailable");
      const body: Record<string, unknown> = {};

      if (payload.message != null) {
        // Wrap toward buyer + seller + the admin itself (so the admin re-reads its own message).
        const env = await buildEnvelope({
          senderPrivHex: account.privateKey,
          senderPubHex: account.pubkey,
          recipientPubkeys: [recipients.buyerPubkey, recipients.sellerPubkey, account.pubkey],
          plaintext: payload.message,
        });
        body.ciphertext = env.ciphertext;
        body.keys = env.keys.map((k) => ({
          recipientPubkey: k.recipientPubkey,
          wrappedCek: k.wrappedCek,
        }));
      }
      if (payload.attachment != null) body.attachment = payload.attachment;

      return postSigned(`/chat/${chatId}/admin-message`, body, account.privateKey);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["admin-chat", chatId] });
      void queryClient.invalidateQueries({ queryKey: ["admin-chats"] });
    },
  });
}

export type AdminDisputesQuery = {
  page?: number;
  sort?: string;
  dir?: string;
  search?: string;
};

export function useAdminDisputes(query: AdminDisputesQuery) {
  return useQuery({
    queryKey: ["admin-disputes", query],
    queryFn: () =>
      backend.get<DisputesResponse>("/admin/disputes", { params: query }).then((r) => r.data),
    refetchInterval: 15000,
  });
}

export function useAdminDisputeDetail(orderId: number | null) {
  return useQuery({
    queryKey: ["admin-dispute", orderId],
    queryFn: () => backend.get<OrderDetail>(`/admin/disputes/${orderId}`).then((r) => r.data),
    enabled: orderId != null,
  });
}

export type ConcludeDisputePayload = {
  orderId: number;
  refundAmount: number;
  conclusionStatus: string;
  favouredRole: "buyer" | "seller";
  refundedKeyIds: number[];
};

export function useAdminConcludeDispute(orderId: number, chatId?: number | null) {
  const queryClient = useQueryClient();
  const privateKey = useProfileStore((s) => s.account?.privateKey);

  return useMutation({
    mutationFn: async (payload: ConcludeDisputePayload) => {
      if (!privateKey) {
        throw new Error("Wallet unavailable");
      }
      return postSigned<{ ok: true }>(`/admin/disputes/${orderId}/conclude`, payload, privateKey);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["admin-dispute", orderId] });
      void queryClient.invalidateQueries({ queryKey: ["admin-disputes"] });
      void queryClient.invalidateQueries({ queryKey: ["order-detail", orderId] });
      if (chatId != null) {
        void queryClient.invalidateQueries({ queryKey: ["chat", chatId] });
      }
      toast.success("Dispute concluded.");
    },
    onError: (err: unknown) => {
      const msg = err instanceof Error ? err.message : "An error occurred during the operation";
      toast.error(msg);
    },
  });
}

type FeeConfig = {
  platformFeePercent: number;
  adminDisputeSharePercent: number;
};

export function useAdminFeeConfig() {
  return useQuery({
    queryKey: ["admin-fees"],
    queryFn: () => backend.get<FeeConfig>("/admin/fees").then((r) => r.data),
    staleTime: 5 * 60 * 1000,
  });
}
