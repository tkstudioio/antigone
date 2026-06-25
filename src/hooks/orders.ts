"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { SingleKey } from "@arkade-os/sdk";
import { backend } from "@/lib/backend";
import { postSigned } from "@/lib/auth/signed-request";
import useProfileStore from "@/stores/profile";
import {
  buildAndSignReleaseAsSeller,
  submitAndSignAsBuyer,
  finalizeReleaseAsSeller,
} from "@/lib/ark/release";
import { buildAndSignDisputeAsFavoured, finalizeDisputeAsFavoured } from "@/lib/ark/dispute";
import { calculateAdminDisputeShare } from "@/lib/fees";
import { rewrapCekForRecipient } from "@/lib/crypto/message-envelope";
import { isEnvelope } from "@/lib/crypto/ecies";
import type { ChatDetail } from "@/lib/backend/query-chat-types";
import type { EscrowParams } from "@/lib/ark/escrow";
import type {
  OrdersResponse,
  OrderDetail,
  OrderEscrowDetail,
  OrderRole,
  OrderSortColumn,
  SortDir,
} from "@/lib/backend/query-orders";

export type { OrdersResponse, OrderDetail, OrderRole, OrderSortColumn, SortDir };
export type { OrderListRow } from "@/lib/backend/query-orders";

/** Build the shared signing context from the active profile, or throw a user-facing error. */
function requireWalletContext() {
  const { account, arkProvider, indexerProvider, addresses } = useProfileStore.getState();
  if (!account?.privateKey || !arkProvider || !indexerProvider || !addresses) {
    throw new Error("Wallet not initialized");
  }
  const identity = SingleKey.fromHex(account.privateKey);
  return {
    privateKey: account.privateKey,
    identity,
    arkProvider,
    indexerProvider,
    arkAddress: addresses.offchainAddress,
  };
}

function escrowParamsFrom(escrow: OrderEscrowDetail): EscrowParams {
  if (!escrow.arbiterPubkey) throw new Error("Arbiter missing on the escrow");
  if (!escrow.nonce)
    throw new Error("Nonce missing on the escrow: cannot reconstruct the script");
  return {
    buyerPubkey: escrow.buyerPubkey,
    sellerPubkey: escrow.sellerPubkey,
    adminPubkey: escrow.arbiterPubkey,
    serverPubkey: escrow.serverPubkey,
    exitDelay: escrow.exitDelay,
    scriptNonce: escrow.nonce,
  };
}

/**
 * An order is "active" while a counterparty action can still change its state, so the UI must keep
 * polling. It becomes terminal once the escrow is released/refunded or the order is cancelled —
 * a concluded order whose escrow is still being settled on-chain stays active.
 */
function isOrderActive(order: OrderDetail | undefined): boolean {
  if (!order) return true;
  const escrow = order.escrow?.status;
  if (escrow === "completed" || escrow === "refunded") return false;
  if (order.status === "cancelled" || order.status === "refunded") return false;
  return true;
}

export function useOrders(params: {
  role: OrderRole;
  page?: number;
  sort?: OrderSortColumn;
  dir?: SortDir;
  search?: string;
}) {
  return useQuery({
    queryKey: ["orders", params],
    queryFn: () => backend.get<OrdersResponse>("/orders", { params }).then((r) => r.data),
    enabled: Boolean(params.role),
    refetchInterval: 15000,
  });
}

export function useOrderDetail(id: number | undefined) {
  return useQuery({
    queryKey: ["orders", "detail", id],
    queryFn: () => backend.get<OrderDetail>(`/orders/${id}`).then((r) => r.data),
    enabled: typeof id === "number" && id > 0,
    // Adaptive polling: refresh live while the order is active, stop once terminal.
    refetchInterval: (query) => (isOrderActive(query.state.data) ? 10000 : false),
  });
}

export type EscrowFundingData = {
  total: number;
  price: number;
  funded: boolean;
  /** Soonest batch-expiry (epoch ms) of the locked VTXOs, or null. */
  expiresAt: number | null;
  /** True when batch expiry is near (computed server-side). */
  expirySoon: boolean;
  /** True when the locked funds appear to have been swept by the operator after batch expiry. */
  swept: boolean;
};

/**
 * Live escrow funding (locked vs required sats) for the funding bar. Read-only — does not advance
 * the status. Polls fast (8s) while still awaiting funds, then slowly (60s) while the funds are
 * locked but the order is not yet resolved — so the bar can surface batch-expiry warnings and a
 * possible operator sweep (see P1). Stops once the escrow is terminal (completed/refunded/swept).
 */
export function useEscrowFunding(
  orderId: number | undefined,
  opts?: { enabled?: boolean; escrowStatus?: string }
) {
  const status = opts?.escrowStatus;
  const prelock = status === "awaitingFunds" || status === "partiallyFunded";
  // States where funds are locked and an expiry/sweep could still occur before resolution.
  const lockedPending =
    status === "fundLocked" ||
    status === "sellerReady" ||
    status === "buyerCheckpointsSigned" ||
    status === "disputed" ||
    status === "settling";
  return useQuery({
    queryKey: ["orders", "funding", orderId],
    queryFn: () => backend.get<EscrowFundingData>(`/orders/${orderId}/funding`).then((r) => r.data),
    enabled: (opts?.enabled ?? true) && typeof orderId === "number" && orderId > 0,
    refetchInterval: prelock ? 8000 : lockedPending ? 60000 : false,
  });
}

export function useConfirmOrder() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (orderId: number) => {
      const ctx = requireWalletContext();
      return postSigned(`/orders/${orderId}/confirm`, {}, ctx.privateKey);
    },
    onSuccess: (_data, orderId) => {
      queryClient.invalidateQueries({ queryKey: ["orders", "detail", orderId] });
    },
  });
}

/** Ask the server to re-check the Arkade indexer and lock the escrow once it is funded. */
export function useVerifyFunding() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (orderId: number) => {
      const ctx = requireWalletContext();
      return postSigned<{
        funded: boolean;
        total: number;
        escrowStatus: string;
      }>(`/orders/${orderId}/verify-funding`, {}, ctx.privateKey);
    },
    onSuccess: (_data, orderId) => {
      queryClient.invalidateQueries({ queryKey: ["orders", "detail", orderId] });
    },
  });
}

/** Seller arms the collaborative release: builds + signs the ark tx, relays it to the buyer. */
export function usePrepareRelease() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (order: OrderDetail) => {
      if (!order.escrow) throw new Error("Escrow missing");
      const ctx = requireWalletContext();
      const prepared = await buildAndSignReleaseAsSeller({
        escrowParams: escrowParamsFrom(order.escrow),
        sellerArkAddress: ctx.arkAddress,
        platformFee: order.platformFee,
        identity: ctx.identity,
        arkProvider: ctx.arkProvider,
        indexerProvider: ctx.indexerProvider,
      });
      return postSigned(
        `/orders/${order.id}/release/prepare`,
        {
          sellerSignedCollabPsbt: prepared.sellerSignedCollabPsbt,
          checkpointPsbts: prepared.checkpointPsbts,
        },
        ctx.privateKey
      );
    },
    onSuccess: (_data, order) => {
      queryClient.invalidateQueries({ queryKey: ["orders", "detail", order.id] });
    },
  });
}

/**
 * Seller one-click action on `fundLocked`: deliver the keys (confirm) and immediately arm the
 * collaborative release (prepare). Two server calls, one user action — `confirmOrder` flips the
 * order to `completed` server-side, which is exactly the precondition `prepareRelease` checks.
 * If `prepare` fails the order stays `completed`/`fundLocked`, so the standalone "Prepare release"
 * button reappears after the next refetch as a fallback.
 */
export function useConfirmAndPrepareRelease() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (order: OrderDetail) => {
      if (!order.escrow) throw new Error("Escrow missing");
      const ctx = requireWalletContext();
      // 1. Deliver keys — server sets order.status = "completed".
      await postSigned(`/orders/${order.id}/confirm`, {}, ctx.privateKey);
      // 2. Arm the collaborative release (build + sign client-side, relay to buyer).
      const prepared = await buildAndSignReleaseAsSeller({
        escrowParams: escrowParamsFrom(order.escrow),
        sellerArkAddress: ctx.arkAddress,
        platformFee: order.platformFee,
        identity: ctx.identity,
        arkProvider: ctx.arkProvider,
        indexerProvider: ctx.indexerProvider,
      });
      return postSigned(
        `/orders/${order.id}/release/prepare`,
        {
          sellerSignedCollabPsbt: prepared.sellerSignedCollabPsbt,
          checkpointPsbts: prepared.checkpointPsbts,
        },
        ctx.privateKey
      );
    },
    onSuccess: (_data, order) => {
      queryClient.invalidateQueries({ queryKey: ["orders", "detail", order.id] });
    },
  });
}

/** Buyer collaborates: countersigns the ark tx, submits to the operator, signs the checkpoints. */
export function useCollaborateRelease() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (order: OrderDetail) => {
      const escrow = order.escrow;
      if (!escrow?.sellerSignedCollabPsbt || !escrow.releaseCheckpointPsbts) {
        throw new Error("The release has not been prepared by the seller yet");
      }
      const ctx = requireWalletContext();
      const result = await submitAndSignAsBuyer({
        sellerSignedCollabPsbt: escrow.sellerSignedCollabPsbt,
        checkpointPsbts: escrow.releaseCheckpointPsbts,
        escrowParams: escrowParamsFrom(escrow),
        platformFee: order.platformFee,
        identity: ctx.identity,
        arkProvider: ctx.arkProvider,
        indexerProvider: ctx.indexerProvider,
      });
      return postSigned(
        `/orders/${order.id}/release/collaborate`,
        {
          collabArkTxid: result.collabArkTxid,
          serverSignedCheckpoints: result.serverSignedCheckpoints,
          buyerSignedCheckpoints: result.buyerSignedCheckpoints,
        },
        ctx.privateKey
      );
    },
    onSuccess: (_data, order) => {
      queryClient.invalidateQueries({ queryKey: ["orders", "detail", order.id] });
    },
  });
}

/** Seller finalizes: signs the last checkpoint and broadcasts, releasing the funds to itself. */
export function useFinalizeRelease() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (order: OrderDetail) => {
      const escrow = order.escrow;
      if (!escrow?.collabArkTxid || !escrow.buyerSignedCheckpoints) {
        throw new Error("The buyer has not collaborated on the release yet");
      }
      const ctx = requireWalletContext();
      await finalizeReleaseAsSeller({
        collabArkTxid: escrow.collabArkTxid,
        buyerSignedCheckpoints: escrow.buyerSignedCheckpoints,
        identity: ctx.identity,
        arkProvider: ctx.arkProvider,
      });
      return postSigned(`/orders/${order.id}/release/finalize`, {}, ctx.privateKey);
    },
    onSuccess: (_data, order) => {
      queryClient.invalidateQueries({ queryKey: ["orders", "detail", order.id] });
    },
  });
}

/**
 * Buyer or seller escalates the order to a dispute. After opening, the party re-wraps every
 * still-encrypted chat message's CEK toward the admin pubkey so the admin can read the history
 * during arbitration (best-effort; skipped when there is no chat or arbiter pubkey).
 */
export function useOpenDispute() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      orderId: number;
      chatId: number | null;
      adminPubkey: string | null;
    }) => {
      const { account } = useProfileStore.getState();
      if (!account?.privateKey) throw new Error("Wallet not initialized");
      const { orderId, chatId, adminPubkey } = input;

      await postSigned(`/orders/${orderId}/dispute`, {}, account.privateKey);

      // Re-wrap the existing chat history toward the admin so it can read it during arbitration.
      // The dispute is already open at this point; if this step fails we surface a clear error so
      // the user can retry, rather than leaving the admin silently unable to read the history.
      if (chatId && adminPubkey) {
        try {
          const { data: chat } = await backend.get<ChatDetail>(`/chat/${chatId}`);
          const keys: { messageId: number; wrappedCek: string; wrapperPubkey: string }[] = [];
          for (const m of chat.messages) {
            if (m.isSystem || !isEnvelope(m.message) || !m.wrappedCek || !m.wrapperPubkey) continue;
            const rewrapped = await rewrapCekForRecipient({
              holderPrivHex: account.privateKey,
              holderPubHex: account.pubkey,
              wrapperPubHex: m.wrapperPubkey,
              wrappedCek: m.wrappedCek,
              newRecipientPubHex: adminPubkey,
            });
            keys.push({
              messageId: m.id,
              wrappedCek: rewrapped.wrappedCek,
              wrapperPubkey: rewrapped.wrapperPubkey,
            });
          }
          if (keys.length > 0) {
            await postSigned(`/chat/${chatId}/grant-admin`, { chatId, keys }, account.privateKey);
          }
        } catch {
          throw new Error(
            "Dispute opened, but it was not possible to give the admin access to the history. Try opening the dispute again."
          );
        }
      }
    },
    onSuccess: (_data, input) => {
      queryClient.invalidateQueries({ queryKey: ["orders", "detail", input.orderId] });
    },
  });
}

/**
 * Favoured party (seller if `completed`, buyer otherwise) prepares the dispute settlement:
 * builds the ark tx via leaf 1/2, signs it, and sends it to the server for admin co-sign + submitTx.
 * Returns `{ disputeArkTxid, adminSignedCheckpoints }` from the server.
 */
export function usePrepareDisputeSettlement() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (order: OrderDetail) => {
      if (!order.escrow) throw new Error("Escrow missing");
      if (!order.conclusionStatus) throw new Error("Dispute outcome missing");
      const ctx = requireWalletContext();
      const escrowParams = escrowParamsFrom(order.escrow);

      // The builder turns this verdict into a breakdown using the locked total (so an overfunding
      // surplus is returned to the buyer); the server re-validates with the same VTXO set.
      const verdict = {
        totalSats: order.totalSats,
        refundAmount: order.refundAmount ?? 0,
        platformFee: order.platformFee,
        adminDisputeShare: order.adminDisputeShare ?? calculateAdminDisputeShare(order.totalSats),
      };

      // Driver/leaf is the admin's explicit choice; fall back to the legacy outcome-based mapping
      // for orders concluded before the `favouredRole` field existed.
      const favouredRole: "buyer" | "seller" =
        order.favouredRole === "buyer" || order.favouredRole === "seller"
          ? order.favouredRole
          : order.conclusionStatus === "completed"
            ? "seller"
            : "buyer";

      const prepared = await buildAndSignDisputeAsFavoured({
        escrowParams,
        favouredRole,
        verdict,
        favouredArkAddress: ctx.arkAddress,
        identity: ctx.identity,
        arkProvider: ctx.arkProvider,
        indexerProvider: ctx.indexerProvider,
      });

      return postSigned<{ disputeArkTxid: string; adminSignedCheckpoints: string[] }>(
        `/orders/${order.id}/settle/prepare`,
        {
          favouredSignedArkPsbt: prepared.favouredSignedArkPsbt,
          checkpointPsbts: prepared.checkpointPsbts,
        },
        ctx.privateKey
      );
    },
    onSuccess: (_data, order) => {
      queryClient.invalidateQueries({ queryKey: ["orders", "detail", order.id] });
    },
  });
}

/**
 * Favoured party finalizes the dispute settlement: adds the last checkpoint signature and
 * sends the fully-signed checkpoints to the server for `finalizeTx`.
 */
export function useFinalizeDisputeSettlement() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (order: OrderDetail) => {
      const escrow = order.escrow;
      if (!escrow?.disputeArkTxid || !escrow.disputeAdminSignedCheckpoints) {
        throw new Error("The settlement has not been prepared yet");
      }
      const ctx = requireWalletContext();

      const fullySignedCheckpoints = await finalizeDisputeAsFavoured({
        adminSignedCheckpoints: escrow.disputeAdminSignedCheckpoints,
        identity: ctx.identity,
      });

      return postSigned(
        `/orders/${order.id}/settle/finalize`,
        { fullySignedCheckpoints },
        ctx.privateKey
      );
    },
    onSuccess: (_data, order) => {
      queryClient.invalidateQueries({ queryKey: ["orders", "detail", order.id] });
    },
  });
}

/**
 * Favoured party one-click settlement: prepare (build + sign the arbiter-leaf ark tx, server
 * co-signs as admin) and finalize (sign the returned checkpoints, server broadcasts) in a single
 * action. The `adminSignedCheckpoints` come straight from the prepare response, so no refetch is
 * needed between the two steps. If finalize fails, the escrow stays `settling` and the standalone
 * "Complete settlement" button reappears after the next refetch as a fallback.
 */
export function useSettleDispute() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (order: OrderDetail) => {
      if (!order.escrow) throw new Error("Escrow missing");
      if (!order.conclusionStatus) throw new Error("Dispute outcome missing");
      const ctx = requireWalletContext();
      const escrowParams = escrowParamsFrom(order.escrow);

      const verdict = {
        totalSats: order.totalSats,
        refundAmount: order.refundAmount ?? 0,
        platformFee: order.platformFee,
        adminDisputeShare: order.adminDisputeShare ?? calculateAdminDisputeShare(order.totalSats),
      };

      const favouredRole: "buyer" | "seller" =
        order.favouredRole === "buyer" || order.favouredRole === "seller"
          ? order.favouredRole
          : order.conclusionStatus === "completed"
            ? "seller"
            : "buyer";

      // 1. Prepare — admin co-signs server-side and returns the admin-signed checkpoints.
      const prepared = await buildAndSignDisputeAsFavoured({
        escrowParams,
        favouredRole,
        verdict,
        favouredArkAddress: ctx.arkAddress,
        identity: ctx.identity,
        arkProvider: ctx.arkProvider,
        indexerProvider: ctx.indexerProvider,
      });
      const prep = await postSigned<{ disputeArkTxid: string; adminSignedCheckpoints: string[] }>(
        `/orders/${order.id}/settle/prepare`,
        {
          favouredSignedArkPsbt: prepared.favouredSignedArkPsbt,
          checkpointPsbts: prepared.checkpointPsbts,
        },
        ctx.privateKey
      );

      // 2. Finalize — add the favoured party's signature to the admin-signed checkpoints, broadcast.
      const fullySignedCheckpoints = await finalizeDisputeAsFavoured({
        adminSignedCheckpoints: prep.adminSignedCheckpoints,
        identity: ctx.identity,
      });
      return postSigned(
        `/orders/${order.id}/settle/finalize`,
        { fullySignedCheckpoints },
        ctx.privateKey
      );
    },
    onSuccess: (_data, order) => {
      queryClient.invalidateQueries({ queryKey: ["orders", "detail", order.id] });
    },
  });
}

/**
 * Stage 2 surface — unilateral CSV exit (stub; the server responds 501).
 */
export function useStartDisputeExit() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (order: OrderDetail) => {
      const { account } = useProfileStore.getState();
      if (!account?.privateKey) throw new Error("Wallet not initialized");
      return postSigned(`/orders/${order.id}/settle/exit`, {}, account.privateKey);
    },
    onSuccess: (_data, order) => {
      queryClient.invalidateQueries({ queryKey: ["orders", "detail", order.id] });
    },
  });
}
