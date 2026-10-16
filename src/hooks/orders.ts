"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArkAddress, SingleKey, type IndexerProvider } from "@arkade-os/sdk";
import { hex } from "@scure/base";
import { backend } from "@/lib/backend";
import { postSigned } from "@/lib/auth/signed-request";
import useProfileStore from "@/stores/profile";
import { acknowledgeArbiter, checkArbiter } from "@/lib/arbiter-pin";
import { assertEscrowOperator, getOperatorSignerPubkey } from "@/lib/ark/operator-signer";
import {
  verifyOrderDetail,
  type OrderVerification,
  type OrderViewer,
} from "@/lib/order-verification";
import {
  buildAndSignReleaseAsSeller,
  submitAndSignAsBuyer,
  finalizeReleaseAsSeller,
} from "@/lib/ark/release";
import {
  buildAndSignDisputeAsFavoured,
  finalizeDisputeAsFavoured,
  type DisputeVerdict,
} from "@/lib/ark/dispute";
import { calculateAdminDisputeShare } from "@/lib/fees";
import { rewrapCekForRecipient } from "@/lib/crypto/message-envelope";
import { isEnvelope } from "@/lib/crypto/ecies";
import { openStoredCode, rewrapCodeKey, type CodeStatus } from "@/lib/crypto/code-envelope";
import type { ChatDetail } from "@/lib/backend/query-chat-types";
import { buildEscrowVtxoScript, type EscrowParams } from "@/lib/ark/escrow";
import type {
  OrdersResponse,
  OrderDetail,
  OrderDetailItem,
  OrderEscrowDetail,
  OrderRole,
  OrderSortColumn,
  SortDir,
} from "@/lib/backend/query-orders";

export type { OrdersResponse, OrderDetail, OrderRole, OrderSortColumn, SortDir };
export type { OrderListRow } from "@/lib/backend/query-orders";

/** An order item after the browser opened its license code (`code` is null when not openable). */
export type OrderDetailItemView = OrderDetailItem & {
  code: string | null;
  codeStatus: CodeStatus;
};

/**
 * The order detail as the UI consumes it: items carry the locally decrypted codes and
 * `verification` holds the outcome of checking the order's signed actions (terms, delivery,
 * dispute, verdict), the operator key and the arbiter pin in this browser.
 */
export type OrderDetailView = Omit<OrderDetail, "items"> & {
  items: OrderDetailItemView[];
  verification: OrderVerification;
};

/**
 * Build the view of an order the server returned: verify its signed actions against their authors
 * (the server is untrusted), anchor the operator key in the ASP's own `getInfo()`, check the arbiter
 * against the TOFU pin, and decrypt the license codes with the in-memory private key (the server
 * only returns ciphertext + the caller's own wrapped key; nothing is ever decrypted server-side).
 */
export async function loadOrderView(params: {
  order: OrderDetail;
  privateKey: string | undefined;
  viewer: OrderViewer;
}): Promise<OrderDetailView> {
  const { order, privateKey, viewer } = params;
  const escrowArbiter = order.escrow?.arbiterPubkey ?? null;
  const operatorPubkey = order.escrow ? await getOperatorSignerPubkey() : null;

  // First pass without the pin: the arbiter an escrow carries is only pinned (TOFU) once the order's
  // signed terms did not fail verification, so a forged order cannot plant its own arbiter.
  const base = verifyOrderDetail({ order, viewer, operatorPubkey, arbiter: null });
  const arbiter =
    viewer.kind === "party" && escrowArbiter && base.terms.status !== "tampered"
      ? checkArbiter(escrowArbiter)
      : null;
  const verification = arbiter
    ? verifyOrderDetail({ order, viewer, operatorPubkey, arbiter })
    : base;

  const items = await Promise.all(
    order.items.map(async (item): Promise<OrderDetailItemView> => {
      const { code, status } = await openStoredCode({
        recipientPrivHex: privateKey,
        ciphertext: item.ciphertext,
        wrappedCek: item.wrappedCek,
        wrapperPubkey: item.wrapperPubkey,
      });
      return { ...item, code, codeStatus: status };
    })
  );
  return { ...order, items, verification };
}

/**
 * Defence in depth behind the disabled buttons: refuse to sign, pay or settle on an order whose
 * verification is blocked.
 */
export function assertOrderActionable(order: Pick<OrderDetailView, "verification">): void {
  if (order.verification.blocked) throw new Error(order.verification.blocked);
}

/** Record that the user accepts a changed arbiter for this browser, then refresh the order views. */
export function useAcknowledgeArbiter() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (arbiterPubkey: string) => {
      if (!acknowledgeArbiter(arbiterPubkey)) {
        throw new Error("Unable to store the acknowledgement in this browser");
      }
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["orders"] });
      void queryClient.invalidateQueries({ queryKey: ["admin-dispute"] });
    },
  });
}

type WrapSource = Pick<OrderDetailItem, "keyId" | "wrappedCek" | "wrapperPubkey">;

/**
 * Re-wrap the content key of each item toward `recipientPubkey` with the holder's own key. With
 * `requireAll`, an item the holder cannot open aborts the whole operation (delivery must cover every
 * key); otherwise such items are skipped (granting the arbiter whatever the party can open).
 */
async function rewrapItemsFor(params: {
  items: WrapSource[];
  holder: { privateKey: string; pubkey: string };
  recipientPubkey: string;
  requireAll: boolean;
}): Promise<{ keyId: number; wrappedCek: string }[]> {
  const { items, holder, recipientPubkey, requireAll } = params;
  const out: { keyId: number; wrappedCek: string }[] = [];
  for (const item of items) {
    if (!item.wrappedCek || !item.wrapperPubkey) {
      if (requireAll) throw new Error(`Key #${item.keyId} cannot be opened with your wallet`);
      continue;
    }
    out.push({
      keyId: item.keyId,
      wrappedCek: await rewrapCodeKey({
        holderPrivHex: holder.privateKey,
        holderPubHex: holder.pubkey,
        wrapperPubHex: item.wrapperPubkey,
        wrappedCek: item.wrappedCek,
        newRecipientPubHex: recipientPubkey,
      }),
    });
  }
  return out;
}

/** Build the shared signing context from the active profile, or throw a user-facing error. */
export function requireWalletContext() {
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

export function escrowParamsFrom(escrow: OrderEscrowDetail): EscrowParams {
  if (!escrow.arbiterPubkey) throw new Error("Arbiter missing on the escrow");
  if (!escrow.nonce) throw new Error("Nonce missing on the escrow: cannot reconstruct the script");
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
 * The verdict frozen at conclusion, as the settlement builder/validator expects it. The refund
 * amount comes from the arbiter's SIGNED verdict and the goods total from the buyer's SIGNED terms
 * (the server's parallel fields are not used when a signed record exists). The platform fee and the
 * admin dispute share are server configuration with no signed anchor. A verdict or terms that failed
 * verification abort the settlement; orders concluded before the signed links existed fall back to
 * the server's fields ("legacy"). Throws when the order has not been concluded yet.
 */
export function disputeVerdictFrom(order: OrderDetailView): DisputeVerdict {
  const { verdict, terms } = order.verification;
  if (verdict.status === "tampered" || terms.status === "tampered") {
    throw new Error("The dispute verdict failed signature verification: refusing to settle");
  }
  const totalSats =
    terms.status === "verified"
      ? terms.body.items.reduce((sum, i) => sum + i.price, 0)
      : order.totalSats;
  if (verdict.status === "verified") {
    return {
      totalSats,
      refundAmount: verdict.body.refundAmount,
      platformFee: order.platformFee,
      adminDisputeShare: order.adminDisputeShare ?? calculateAdminDisputeShare(totalSats),
    };
  }
  if (!order.conclusionStatus) throw new Error("Dispute outcome missing");
  return {
    totalSats,
    refundAmount: order.refundAmount ?? 0,
    platformFee: order.platformFee,
    adminDisputeShare: order.adminDisputeShare ?? calculateAdminDisputeShare(totalSats),
  };
}

/**
 * The party that drives the settlement (and signs via its arbiter leaf) is the arbiter's explicit,
 * SIGNED choice; orders concluded before the signed links existed fall back to the server's field
 * and then to the legacy outcome-based mapping.
 */
export function favouredRoleFrom(order: OrderDetailView): "buyer" | "seller" {
  const { verdict } = order.verification;
  if (verdict.status === "tampered") {
    throw new Error("The dispute verdict failed signature verification: refusing to settle");
  }
  if (verdict.status === "verified") return verdict.body.favouredRole;
  if (order.favouredRole === "buyer" || order.favouredRole === "seller") return order.favouredRole;
  return order.conclusionStatus === "completed" ? "seller" : "buyer";
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
  const privateKey = useProfileStore((s) => s.account?.privateKey);
  const pubkey = useProfileStore((s) => s.account?.pubkey);
  return useQuery({
    queryKey: ["orders", "detail", id, pubkey, Boolean(privateKey)],
    queryFn: async (): Promise<OrderDetailView> => {
      const { data } = await backend.get<OrderDetail>(`/orders/${id}`);
      return loadOrderView({
        order: data,
        privateKey,
        viewer: { pubkey: pubkey ?? null, kind: "party" },
      });
    },
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
  /** True when batch expiry is near (computed in the browser, on the local clock). */
  expirySoon: boolean;
  /** True when the locked funds appear to have been swept by the operator after batch expiry. */
  swept: boolean;
};

/** Warn this many ms before batch expiry (~3 days). */
const EXPIRY_WARNING_WINDOW_MS = 3 * 24 * 60 * 60 * 1000;

/** Escrow states in which "funded before, no VTXOs left" means the funds were swept. */
const SWEEP_SUSPECT_STATUSES = [
  "fundLocked",
  "sellerReady",
  "disputed",
  "settlementPrepared",
  "expiredSwept",
];

/**
 * Funding facts from the escrow's spendable VTXOs as the Ark indexer reported them: locked total,
 * soonest batch expiry, expiry warning and the sweep heuristic. Pure (no I/O). The only inputs that
 * are not chain facts are the escrow's required price and its funded-before / status markers, which
 * only gate the sweep heuristic.
 */
export function summarizeEscrowFunding(params: {
  vtxos: ReadonlyArray<{ value: number; virtualStatus?: { batchExpiry?: number } }>;
  price: number;
  escrowStatus: string;
  fundedBefore: boolean;
  now?: number;
}): EscrowFundingData {
  const { vtxos, price, escrowStatus, fundedBefore, now = Date.now() } = params;
  const total = vtxos.reduce((sum, v) => sum + v.value, 0);
  const expiries = vtxos
    .map((v) => v.virtualStatus?.batchExpiry)
    .filter((e): e is number => typeof e === "number" && e > 0);
  const expiresAt = expiries.length > 0 ? Math.min(...expiries) : null;
  // A transient empty read only clears on the next poll; this never changes any state.
  const swept = total === 0 && fundedBefore && SWEEP_SUSPECT_STATUSES.includes(escrowStatus);
  const expirySoon =
    !swept &&
    expiresAt != null &&
    expiresAt - now > 0 &&
    expiresAt - now < EXPIRY_WARNING_WINDOW_MS;
  return { total, price, funded: total >= price, expiresAt, expirySoon, swept };
}

/**
 * Read the escrow's funding straight from the Ark indexer in the browser. The script is re-derived
 * locally from the escrow params and must produce the stored address — our API is not consulted for
 * any chain fact.
 */
async function readEscrowFundingFromIndexer(params: {
  indexerProvider: IndexerProvider;
  escrow: OrderEscrowDetail;
}): Promise<EscrowFundingData> {
  const { indexerProvider, escrow } = params;
  const script = buildEscrowVtxoScript(escrowParamsFrom(escrow));
  const pkScriptHex = hex.encode(script.pkScript);
  if (hex.encode(ArkAddress.decode(escrow.address).pkScript) !== pkScriptHex) {
    throw new Error("The escrow parameters do not match the escrow address");
  }
  const { vtxos } = await indexerProvider.getVtxos({ scripts: [pkScriptHex], spendableOnly: true });
  return summarizeEscrowFunding({
    vtxos,
    price: escrow.price,
    escrowStatus: escrow.status,
    fundedBefore: escrow.fundedAt != null,
  });
}

/**
 * Live escrow funding (locked vs required sats) for the funding bar, read from the Ark INDEXER in
 * the browser (the wallet context's indexer provider), not from our API. Read-only — does not
 * advance the status. Polls fast (8s) while still awaiting funds, then slowly (60s) while the funds
 * are locked but the order is not yet resolved — so the bar can surface batch-expiry warnings and a
 * possible operator sweep. Stops once the escrow is terminal (completed/refunded/swept).
 *
 * `unavailable` is true while the indexer cannot be reached (ASP down, wallet context missing): the
 * bar then says so explicitly instead of falling back to a value from the server.
 */
export function useEscrowFunding(
  escrow: OrderEscrowDetail | null | undefined,
  opts?: { enabled?: boolean }
) {
  const indexerProvider = useProfileStore((s) => s.indexerProvider);
  const status = escrow?.status;
  const prelock = status === "awaitingFunds" || status === "partiallyFunded";
  // States where funds are locked and an expiry/sweep could still occur before resolution.
  const lockedPending =
    status === "fundLocked" ||
    status === "sellerReady" ||
    status === "buyerCheckpointsSigned" ||
    status === "disputed" ||
    status === "settlementPrepared" ||
    status === "settling";
  const query = useQuery({
    queryKey: ["orders", "funding", escrow?.address, status, Boolean(indexerProvider)],
    queryFn: () =>
      readEscrowFundingFromIndexer({ indexerProvider: indexerProvider!, escrow: escrow! }),
    enabled: (opts?.enabled ?? true) && Boolean(escrow) && Boolean(indexerProvider),
    refetchInterval: prelock ? 8000 : lockedPending ? 60000 : false,
    retry: 1,
  });
  const unavailable = Boolean(escrow) && (!indexerProvider || query.isError);
  return { ...query, unavailable };
}

/**
 * Seller-side delivery payload: the content key of every order key re-wrapped toward the buyer.
 * Throws "Wallet unavailable" when the private key is not in memory.
 */
async function buildBuyerWraps(order: OrderDetailView) {
  const { account } = useProfileStore.getState();
  if (!account?.privateKey) throw new Error("Wallet unavailable");
  const keys = await rewrapItemsFor({
    items: order.items,
    holder: { privateKey: account.privateKey, pubkey: account.pubkey },
    recipientPubkey: order.buyer.pubkey,
    requireAll: true,
  });
  return { keys, privateKey: account.privateKey };
}

/**
 * Cancel an unpaid order: the keys go back on sale, the reservation is dropped and the order chat is
 * closed. The server only accepts it while no funds are locked in the escrow, from the buyer at any
 * time and from the seller once the payment deadline has passed (`paymentExpiresAt`). Errors (403 /
 * 409 / 503) are surfaced to the caller. Refreshes the order detail and every order list.
 */
export function useCancelOrder() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: { orderId: number }) => {
      const { account } = useProfileStore.getState();
      if (!account?.privateKey) throw new Error("Wallet not initialized");
      const { orderId } = input;
      return postSigned(`/orders/${orderId}/cancel`, { orderId }, account.privateKey);
    },
    onSuccess: () => {
      // Prefix match: covers the order detail and all order lists.
      void queryClient.invalidateQueries({ queryKey: ["orders"] });
    },
  });
}

/** Seller confirms the order = delivers the keys (re-wrapped toward the buyer). */
export function useConfirmOrder() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (order: OrderDetailView) => {
      assertOrderActionable(order);
      const { keys, privateKey } = await buildBuyerWraps(order);
      return postSigned(`/orders/${order.id}/confirm`, { keys }, privateKey);
    },
    onSuccess: (_data, order) => {
      queryClient.invalidateQueries({ queryKey: ["orders", "detail", order.id] });
    },
  });
}

/**
 * Re-wrap the content keys the caller can open toward the escrow arbiter and send them. The order is
 * re-fetched so the wraps reflect the server's current state (e.g. keys delivered a moment ago).
 * Skips silently when there is nothing to share.
 */
async function grantArbiterKeysForOrder(params: { orderId: number; arbiterPubkey: string }) {
  const { account } = useProfileStore.getState();
  if (!account?.privateKey) throw new Error("Wallet unavailable");
  const { data: order } = await backend.get<OrderDetail>(`/orders/${params.orderId}`);
  const keys = await rewrapItemsFor({
    items: order.items,
    holder: { privateKey: account.privateKey, pubkey: account.pubkey },
    recipientPubkey: params.arbiterPubkey,
    requireAll: false,
  });
  if (keys.length === 0) return;
  await postSigned(`/orders/${params.orderId}/grant-arbiter-keys`, { keys }, account.privateKey);
}

/**
 * Seller delivers the keys during a dispute (opened before confirmation, so the keys were never
 * delivered): same wraps as a confirmation, no status change, then shares every key with the arbiter
 * so the admin can inspect what is being delivered.
 */
export function useDeliverKeys() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (order: OrderDetailView) => {
      assertOrderActionable(order);
      const { keys, privateKey } = await buildBuyerWraps(order);
      await postSigned(`/orders/${order.id}/deliver`, { keys }, privateKey);
      // Share with the TRUSTED arbiter (the pinned one), never an arbiter key only the server named.
      const arbiterPubkey = order.verification.trustedArbiterPubkey;
      if (arbiterPubkey) {
        try {
          await grantArbiterKeysForOrder({ orderId: order.id, arbiterPubkey });
        } catch {
          throw new Error(
            "Keys delivered, but it was not possible to share them with the arbiter. Try again."
          );
        }
      }
    },
    onSuccess: (_data, order) => {
      queryClient.invalidateQueries({ queryKey: ["orders", "detail", order.id] });
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
    mutationFn: async (order: OrderDetailView) => {
      if (!order.escrow) throw new Error("Escrow missing");
      assertOrderActionable(order);
      await assertEscrowOperator(order.escrow);
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
    mutationFn: async (order: OrderDetailView) => {
      if (!order.escrow) throw new Error("Escrow missing");
      assertOrderActionable(order);
      await assertEscrowOperator(order.escrow);
      const ctx = requireWalletContext();
      // 1. Deliver keys (re-wrapped toward the buyer) — server sets order.status = "completed".
      const { keys } = await buildBuyerWraps(order);
      await postSigned(`/orders/${order.id}/confirm`, { keys }, ctx.privateKey);
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
    mutationFn: async (order: OrderDetailView) => {
      const escrow = order.escrow;
      if (!escrow?.sellerSignedCollabPsbt || !escrow.releaseCheckpointPsbts) {
        throw new Error("The release has not been prepared by the seller yet");
      }
      assertOrderActionable(order);
      await assertEscrowOperator(escrow);
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
    mutationFn: async (order: OrderDetailView) => {
      const escrow = order.escrow;
      if (!escrow?.collabArkTxid || !escrow.buyerSignedCheckpoints) {
        throw new Error("The buyer has not collaborated on the release yet");
      }
      assertOrderActionable(order);
      await assertEscrowOperator(escrow);
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
 * during arbitration (best-effort; skipped when there is no chat or arbiter pubkey), then re-wraps
 * the content key of every license code it can open (seller: all; buyer: the delivered ones) toward
 * the arbiter via `grant-arbiter-keys`.
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

      // Post-dispute sharing steps that failed (the dispute itself is already open).
      const failures: string[] = [];

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
          failures.push("give the admin access to the chat history");
        }
      }

      // Share the license codes this party can open with the arbiter. Independent of the chat step
      // (it runs even if that failed); the seller can retry later via "Deliver keys".
      if (adminPubkey) {
        try {
          await grantArbiterKeysForOrder({ orderId, arbiterPubkey: adminPubkey });
        } catch {
          failures.push("share the license keys with the admin");
        }
      }

      if (failures.length > 0) {
        throw new Error(
          `Dispute opened, but it was not possible to ${failures.join(" and ")}. Try again.`
        );
      }
    },
    onSuccess: (_data, input) => {
      queryClient.invalidateQueries({ queryKey: ["orders", "detail", input.orderId] });
    },
  });
}

/**
 * Dispute settlement step 1 — the favoured party (the admin's choice) prepares: builds the ark tx
 * via leaf 1/2, signs it and relays it to the server, which validates and persists it for the
 * arbiter to co-sign (escrow → `settlementPrepared`). Nothing reaches the operator yet.
 */
export function usePrepareDisputeSettlement() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (order: OrderDetailView) => {
      if (!order.escrow) throw new Error("Escrow missing");
      assertOrderActionable(order);
      await assertEscrowOperator(order.escrow);
      const ctx = requireWalletContext();

      // The builder turns this verdict into a breakdown using the locked total (so an overfunding
      // surplus is returned to the buyer); the server and the arbiter re-validate with the same
      // VTXO set.
      const prepared = await buildAndSignDisputeAsFavoured({
        escrowParams: escrowParamsFrom(order.escrow),
        favouredRole: favouredRoleFrom(order),
        verdict: disputeVerdictFrom(order),
        favouredArkAddress: ctx.arkAddress,
        identity: ctx.identity,
        arkProvider: ctx.arkProvider,
        indexerProvider: ctx.indexerProvider,
      });

      return postSigned<{ ok: true }>(
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
 * Dispute settlement step 3 — the favoured party finalizes: signs the arbiter-signed checkpoints and
 * calls `finalizeTx` on the operator from the browser (mirror of `useFinalizeRelease`), then records
 * the terminal state on the server. If `finalizeTx` fails the escrow stays `settling` and the
 * "Complete settlement" button remains available for a retry.
 */
export function useFinalizeDisputeSettlement() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (order: OrderDetailView) => {
      const escrow = order.escrow;
      if (!escrow?.disputeArkTxid || !escrow.disputeAdminSignedCheckpoints) {
        throw new Error("The arbiter has not co-signed the settlement yet");
      }
      assertOrderActionable(order);
      await assertEscrowOperator(escrow);
      const ctx = requireWalletContext();

      await finalizeDisputeAsFavoured({
        disputeArkTxid: escrow.disputeArkTxid,
        adminSignedCheckpoints: escrow.disputeAdminSignedCheckpoints,
        identity: ctx.identity,
        arkProvider: ctx.arkProvider,
      });

      return postSigned(
        `/orders/${order.id}/settle/finalize`,
        { disputeArkTxid: escrow.disputeArkTxid },
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
    mutationFn: async (order: OrderDetailView) => {
      const { account } = useProfileStore.getState();
      if (!account?.privateKey) throw new Error("Wallet not initialized");
      return postSigned(`/orders/${order.id}/settle/exit`, {}, account.privateKey);
    },
    onSuccess: (_data, order) => {
      queryClient.invalidateQueries({ queryKey: ["orders", "detail", order.id] });
    },
  });
}
