"use client";

import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { backend } from "@/lib/backend/index";
import { postSigned, requestSigned, uploadSigned } from "@/lib/auth/signed-request";
import useProfileStore from "@/stores/profile";
import { buildEnvelope } from "@/lib/crypto/message-envelope";
import { validateAndCosignDisputeAsArbiter } from "@/lib/ark/dispute";
import { derivePubkey } from "@/lib/utils";
import {
  assertOrderActionable,
  disputeVerdictFrom,
  escrowParamsFrom,
  favouredRoleFrom,
  loadOrderView,
  requireWalletContext,
  type OrderDetailView,
} from "@/hooks/orders";
import { assertEscrowOperator } from "@/lib/ark/operator-signer";
import { sendOnChain, verifyAndDecryptChat } from "@/hooks/chat";
import type { AdminChatsResponse } from "@/lib/backend/query-chats";
import type { ChatDetail } from "@/lib/backend/query-chat-types";
import type { AttachmentMeta, ChatParties, VerifiedChatDetail } from "@/hooks/chat";
import type { DisputesResponse, OrderDetail } from "@/lib/backend/query-orders";
import type {
  AdminProductRow,
  AdminProductSort,
  AdminProductsResponse,
  AdminProductStatus,
} from "@/lib/backend/query-admin-products";
import { toast } from "react-toastify";

export type { AdminChatsResponse };
export type { AdminProductRow, AdminProductSort, AdminProductsResponse, AdminProductStatus };

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

/**
 * The admin's view of a chat, verified and decrypted. The arbiter (the admin itself) is the signer's
 * own key. `buyerSeller` should come from the VERIFIED order (the dispute detail); without it the
 * server's buyer/seller are used.
 */
export function useAdminChat(
  chatId: number | null,
  buyerSeller?: Pick<ChatParties, "buyerPubkey" | "sellerPubkey">
) {
  const privateKey = useProfileStore((s) => s.account?.privateKey);
  const ownPubkey = useProfileStore((s) => s.account?.pubkey);
  return useQuery({
    queryKey: [
      "admin-chat",
      chatId,
      privateKey,
      buyerSeller?.buyerPubkey ?? null,
      buyerSeller?.sellerPubkey ?? null,
    ],
    queryFn: async (): Promise<VerifiedChatDetail> => {
      const { data } = await backend.get<ChatDetail>(`/admin/chat/${chatId}`);
      return verifyAndDecryptChat({
        chat: data,
        parties: {
          buyerPubkey: buyerSeller?.buyerPubkey ?? data.buyerPubkey,
          sellerPubkey: buyerSeller?.sellerPubkey ?? data.sellerPubkey,
          arbiterPubkey: ownPubkey ?? null,
        },
        viewerPubkey: ownPubkey,
        privateKey,
      });
    },
    enabled: chatId != null,
    // Poll for new messages while the chat is open; stop once it is closed.
    refetchInterval: (q) => (q.state.data?.status === "closed" ? false : 10000),
  });
}

export function useUploadAdminChatAttachment(chatId: number | null) {
  const privateKey = useProfileStore((s) => s.account?.privateKey);
  return useMutation({
    mutationFn: async (file: File): Promise<AttachmentMeta> => {
      if (chatId == null) throw new Error("chatId unavailable");
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

      return sendOnChain({
        fetchChat: () => backend.get<ChatDetail>(`/admin/chat/${chatId}`).then((r) => r.data),
        send: (prevHash) =>
          postSigned(`/chat/${chatId}/admin-message`, { ...body, prevHash }, account.privateKey),
      });
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

/** Escrow states in which the settlement is still moving (a party or the arbiter has a pending move). */
const ADMIN_WATCHED_ESCROW_STATUSES = ["disputed", "settlementPrepared", "settling"];

/**
 * Dispute detail for the admin. The license codes arrive as ciphertext + the arbiter-wrapped key
 * (present only once a party shared it); they are decrypted here with the admin's in-memory key. The
 * order's signed actions (buyer's checkout terms, delivery, dispute opening and the admin's own
 * verdict) are verified in the browser; the arbiter of the escrow must be the admin's own key.
 */
export function useAdminDisputeDetail(orderId: number | null) {
  const privateKey = useProfileStore((s) => s.account?.privateKey);
  const pubkey = useProfileStore((s) => s.account?.pubkey);
  return useQuery({
    queryKey: ["admin-dispute", orderId, pubkey, Boolean(privateKey)],
    queryFn: async (): Promise<OrderDetailView> => {
      const { data } = await backend.get<OrderDetail>(`/admin/disputes/${orderId}`);
      return loadOrderView({
        order: data,
        privateKey,
        viewer: { pubkey: pubkey ?? null, kind: "arbiter" },
      });
    },
    enabled: orderId != null,
    // Poll while the settlement is in flight so the admin sees the favoured party's prepare (and
    // the final status) without reloading; stop once the escrow is terminal.
    refetchInterval: (q) =>
      ADMIN_WATCHED_ESCROW_STATUSES.includes(q.state.data?.escrow?.status ?? "") ? 10000 : false,
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

/**
 * Dispute settlement step 2 — the arbiter co-signs in its own browser. The stored favoured-signed
 * PSBT is validated independently (escrow re-derivation, own-pubkey check, VTXOs read from the Ark
 * indexer, breakdown recomputed from the verdict, shared gates), then signed, submitted to the
 * operator and the returned checkpoints signed — all client-side. Only the resulting txid and
 * checkpoints are posted. Any validation failure aborts before anything is signed or sent.
 */
export function useCosignDisputeSettlement(orderId: number) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (order: OrderDetailView) => {
      const escrow = order.escrow;
      if (!escrow?.disputeFavouredSignedArkPsbt || !escrow.disputeCheckpointPsbts) {
        throw new Error("The favoured party has not prepared the settlement yet");
      }
      // The verdict and terms the co-signature is validated against must have verified, and the
      // operator key in the escrow must be the operator's own.
      assertOrderActionable(order);
      await assertEscrowOperator(escrow);
      const ctx = requireWalletContext();

      const cosigned = await validateAndCosignDisputeAsArbiter({
        favouredSignedArkPsbt: escrow.disputeFavouredSignedArkPsbt,
        checkpointPsbts: escrow.disputeCheckpointPsbts,
        escrowParams: escrowParamsFrom(escrow),
        escrowAddress: escrow.address,
        favouredRole: favouredRoleFrom(order),
        verdict: disputeVerdictFrom(order),
        ownPubkey: derivePubkey(ctx.privateKey),
        identity: ctx.identity,
        arkProvider: ctx.arkProvider,
        indexerProvider: ctx.indexerProvider,
      });

      return postSigned<{ ok: true }>(
        `/admin/disputes/${orderId}/cosign`,
        {
          disputeArkTxid: cosigned.disputeArkTxid,
          serverSignedCheckpoints: cosigned.serverSignedCheckpoints,
          adminSignedCheckpoints: cosigned.adminSignedCheckpoints,
        },
        ctx.privateKey
      );
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["admin-dispute", orderId] });
      void queryClient.invalidateQueries({ queryKey: ["admin-disputes"] });
      toast.success("Settlement co-signed.");
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

// ─── Catalog ─────────────────────────────────────────────────────────────────

export type AdminProductsQuery = {
  page?: number;
  search?: string;
  status?: AdminProductStatus;
  sort?: AdminProductSort;
  dir?: "asc" | "desc";
};

export function useAdminProducts(query: AdminProductsQuery) {
  return useQuery({
    queryKey: ["admin-products", query],
    queryFn: () =>
      backend.get<AdminProductsResponse>("/admin/products", { params: query }).then((r) => r.data),
    placeholderData: keepPreviousData,
  });
}

/** The editable fields of a product, as the create/update endpoints take them. */
export type ProductFields = {
  name: string;
  slug: string;
  description: string | null;
  rating: number | null;
  imageUrl: string | null;
};

function invalidateCatalog(queryClient: ReturnType<typeof useQueryClient>) {
  void queryClient.invalidateQueries({ queryKey: ["admin-products"] });
  void queryClient.invalidateQueries({ queryKey: ["products"] });
}

/**
 * Create (no `id`) or update a product. A new image `file`, if any, is uploaded first (signed raw
 * upload) and its bucket key becomes `imageUrl`.
 */
export function useSaveProduct() {
  const queryClient = useQueryClient();
  const privateKey = useProfileStore((s) => s.account?.privateKey);

  return useMutation({
    mutationFn: async ({
      id,
      fields,
      file,
    }: {
      id?: number;
      fields: ProductFields;
      file?: File | null;
    }): Promise<{ id: number; slug: string }> => {
      if (!privateKey) throw new Error("Wallet unavailable");

      let imageUrl = fields.imageUrl;
      if (file) {
        const { key } = await uploadSigned<{ key: string }>(
          "/admin/products/image",
          file,
          privateKey
        );
        imageUrl = key;
      }

      const payload = { ...fields, imageUrl };
      return id == null
        ? postSigned("/admin/products", payload, privateKey)
        : requestSigned("PATCH", `/admin/products/${id}`, { id, ...payload }, privateKey);
    },
    onSuccess: () => invalidateCatalog(queryClient),
  });
}

export function useSetProductArchived() {
  const queryClient = useQueryClient();
  const privateKey = useProfileStore((s) => s.account?.privateKey);

  return useMutation({
    mutationFn: async ({ id, archived }: { id: number; archived: boolean }) => {
      if (!privateKey) throw new Error("Wallet unavailable");
      return postSigned<{ id: number; archivedAt: string | null }>(
        `/admin/products/${id}/archive`,
        { id, archived },
        privateKey
      );
    },
    onSuccess: () => invalidateCatalog(queryClient),
  });
}

export function useDeleteProduct() {
  const queryClient = useQueryClient();
  const privateKey = useProfileStore((s) => s.account?.privateKey);

  return useMutation({
    mutationFn: async ({ id }: { id: number }) => {
      if (!privateKey) throw new Error("Wallet unavailable");
      return requestSigned<{ deleted: true }>(
        "DELETE",
        `/admin/products/${id}`,
        { id },
        privateKey
      );
    },
    onSuccess: () => invalidateCatalog(queryClient),
  });
}
