/**
 * Server-only Prisma queries for the orders feature.
 *
 * Key business rule for key codes visibility:
 *   - Seller: always sees the full key codes for their orders.
 *   - Buyer: only sees a key code when key.buyerPubkey IS NOT NULL
 *     (i.e. the seller has confirmed the order and assigned the key).
 */
import "server-only";

import { db } from "@/db";
import type { Prisma } from "@prisma/client";
import { safeDecryptCode } from "@/lib/crypto/symmetric";
import { getEscrowFunding } from "@/lib/ark/funding";
import { mayAdminReadOrder } from "@/lib/backend/dispute-access";

// ─── Shared types ─────────────────────────────────────────────────────────────

export type OrderRole = "buyer" | "seller";
export type OrderSortColumn = "lastActivity" | "createdAt" | "totalSats" | "status";
export type SortDir = "asc" | "desc";

export type OrderListRow = {
  id: number;
  status: string;
  totalSats: number;
  createdAt: string;
  completedAt: string | null;
  /** Latest of createdAt/completedAt/concludedAt — used to sort the list by last activity. */
  lastActivityAt: string;
  escrowAddress: string | null;
  counterpartyPubkey: string;
  counterpartyUsername: string;
  productSummary: {
    firstProductName: string | null;
    itemCount: number;
  };
};

/**
 * "Last activity" of an order. No `updatedAt` exists, so we derive it from the timestamps we do
 * persist. Note: `disputed`/`cancelled` have no dedicated timestamp, so such orders keep their
 * previous activity date and do not bubble to the top — a known, accepted limitation.
 */
function computeLastActivity(r: {
  createdAt: Date;
  completedAt: Date | null;
  concludedAt: Date | null;
}): Date {
  let max = r.createdAt;
  if (r.completedAt && r.completedAt > max) max = r.completedAt;
  if (r.concludedAt && r.concludedAt > max) max = r.concludedAt;
  return max;
}

export type OrdersResponse = {
  data: OrderListRow[];
  total: number;
  page: number;
  pageSize: number;
};

export type OrderDetailItem = {
  keyId: number;
  code: string | null;
  productId: number;
  productName: string;
  productSlug: string;
  price: number;
  refunded: boolean;
};

export type OrderEscrowDetail = {
  address: string;
  status: string;
  price: number;
  /** Parameters needed to re-derive the VTXO script client-side for the release. */
  buyerPubkey: string;
  sellerPubkey: string;
  arbiterPubkey: string | null;
  serverPubkey: string;
  exitDelay: number;
  /** Per-order commitment nonce (64-char hex) required to reconstruct the 7-leaf escrow script. */
  nonce: string;
  /** Relayed PSBTs driving the collaborative release (null until the matching step runs). */
  sellerSignedCollabPsbt: string | null;
  releaseCheckpointPsbts: string[] | null;
  collabArkTxid: string | null;
  serverSignedCheckpoints: string[] | null;
  buyerSignedCheckpoints: string[] | null;
  fundedAt: string | null;
  releasedAt: string | null;
  /** Dispute settlement relay fields (null until prepare runs). */
  disputeArkTxid: string | null;
  disputeAdminSignedCheckpoints: string[] | null;
  settledAt: string | null;
};

export type OrderDetail = {
  id: number;
  status: string;
  totalSats: number;
  platformFee: number;
  adminDisputeShare: number | null;
  createdAt: string;
  completedAt: string | null;
  escrowAddress: string | null;
  escrow: OrderEscrowDetail | null;
  chatId: number | null;
  role?: OrderRole;
  buyer: { pubkey: string; username: string };
  seller: { pubkey: string; username: string };
  items: OrderDetailItem[];
  refundAmount: number | null;
  conclusionStatus: string | null;
  favouredRole: string | null;
  refundSignature: string | null;
  concludedAt: string | null;
};

/** Safely parse a JSON-stringified `string[]` column; returns null when empty/invalid. */
function parsePsbtArray(value: string | null): string[] | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? (parsed as string[]) : null;
  } catch {
    return null;
  }
}

// ─── readEscrowFunding ──────────────────────────────────────────────────────────
// Read-only escrow funding lookup for the live funding bar. Unlike `verifyEscrowFunding`
// (mutations-orders.ts) this NEVER advances the escrow status — it only reports the locked
// total vs the required price. Buyer, seller and admin may read it.

export type EscrowFundingResult = {
  total: number;
  price: number;
  funded: boolean;
  /** Soonest batch-expiry (epoch ms) of the locked VTXOs, or null. The order must resolve before this. */
  expiresAt: number | null;
  /** True when batch expiry is within {@link EXPIRY_WARNING_WINDOW_MS}. Computed server-side (authoritative clock). */
  expirySoon: boolean;
  /** Heuristic: the escrow was funded but its VTXOs are gone while still in a locked state → likely swept. */
  swept: boolean;
};

/** Warn this many ms before batch expiry (~3 days). */
const EXPIRY_WARNING_WINDOW_MS = 3 * 24 * 60 * 60 * 1000;

export async function readEscrowFunding(params: {
  orderId: number;
  pubkey: string;
  isAdmin: boolean;
}): Promise<EscrowFundingResult | { error: string; status: number }> {
  const { orderId, pubkey, isAdmin } = params;

  const orderRow = await db.order.findUnique({ where: { id: orderId } });
  if (!orderRow) return { error: "Ordine non trovato", status: 404 };
  if (!isAdmin && orderRow.buyerPubkey !== pubkey && orderRow.sellerPubkey !== pubkey) {
    return { error: "Accesso non autorizzato", status: 403 };
  }
  if (!orderRow.escrowAddress) return { error: "Escrow mancante", status: 409 };

  const escrow = await db.escrow.findUnique({ where: { address: orderRow.escrowAddress } });
  if (!escrow) return { error: "Escrow non trovato", status: 404 };

  const { total, funded, soonestExpiry } = await getEscrowFunding(escrow.address, escrow.price);
  // Read-only sweep heuristic (NOT persisted here — `verifyEscrowFunding` owns the state transition):
  // funded before but no VTXOs left while still in a locked state. A transient empty read just clears
  // on the next poll, so this never irreversibly flips state on a blip.
  const swept =
    total === 0 &&
    escrow.fundedAt != null &&
    (escrow.status === "fundLocked" ||
      escrow.status === "sellerReady" ||
      escrow.status === "disputed" ||
      escrow.status === "expiredSwept");
  const now = Date.now();
  const expirySoon =
    !swept &&
    soonestExpiry != null &&
    soonestExpiry - now > 0 &&
    soonestExpiry - now < EXPIRY_WARNING_WINDOW_MS;
  return { total, price: escrow.price, funded, expiresAt: soonestExpiry, expirySoon, swept };
}

// ─── queryOrders ──────────────────────────────────────────────────────────────

export async function queryOrders(params: {
  pubkey: string;
  role?: OrderRole | null;
  search?: string | null;
  sort?: OrderSortColumn;
  dir?: SortDir;
  page?: number;
  pageSize?: number;
}): Promise<OrdersResponse> {
  const { pubkey, role } = params;
  const search = params.search ?? null;
  const sort = params.sort ?? "lastActivity";
  const dir = params.dir ?? "desc";
  const page = Math.max(1, params.page ?? 1);
  const pageSize = Math.min(100, Math.max(1, params.pageSize ?? 20));
  const offset = (page - 1) * pageSize;

  // Build role filter
  const roleFilter = (() => {
    if (!role) return { OR: [{ buyerPubkey: pubkey }, { sellerPubkey: pubkey }] };
    if (role === "buyer") return { buyerPubkey: pubkey };
    return { sellerPubkey: pubkey };
  })();

  // Build search filter — strict parity with raw query: when role is null,
  // the original raw query used buyer_pubkey as the counterparty column, so
  // we restrict search to the buyer side (i.e. join was against buyer account).
  // For role=buyer counterparty is seller; for role=seller counterparty is buyer.
  const searchFilter =
    search != null && search.length > 0
      ? (() => {
          if (role === "buyer")
            return { seller: { username: { contains: search, mode: "insensitive" as const } } };
          if (role === "seller")
            return { buyer: { username: { contains: search, mode: "insensitive" as const } } };
          // !role — match raw query's buyer_pubkey counterparty default
          return { buyer: { username: { contains: search, mode: "insensitive" as const } } };
        })()
      : {};

  const where = { ...roleFilter, ...searchFilter };

  const includeAccounts = {
    buyer: { select: { pubkey: true, username: true } },
    seller: { select: { pubkey: true, username: true } },
  } satisfies Prisma.OrderInclude;

  type OrderWithAccounts = Prisma.OrderGetPayload<{ include: typeof includeAccounts }>;

  let rows: OrderWithAccounts[];
  let total: number;

  if (sort === "lastActivity") {
    // No DB column for "last activity" (it's MAX of three timestamps), so we order it in the app.
    // Scope is a single user's own orders, so the matching set is small in practice for a prototype:
    // fetch just the ids + timestamps, sort, slice the page, then hydrate the page rows.
    const matching = await db.order.findMany({
      where,
      select: { id: true, createdAt: true, completedAt: true, concludedAt: true },
    });
    total = matching.length;
    const ordered = matching
      .map((o) => ({ id: o.id, activity: computeLastActivity(o).getTime() }))
      .sort((a, b) => (dir === "asc" ? a.activity - b.activity : b.activity - a.activity));
    const pageIds = ordered.slice(offset, offset + pageSize).map((o) => o.id);

    const fetched = await db.order.findMany({
      where: { id: { in: pageIds } },
      include: includeAccounts,
    });
    const byId = new Map(fetched.map((r) => [r.id, r]));
    rows = pageIds.map((id) => byId.get(id)).filter((r): r is OrderWithAccounts => r != null);
  } else {
    const orderBy: Prisma.OrderOrderByWithRelationInput = (() => {
      if (sort === "totalSats") return { totalSats: dir };
      if (sort === "status") return { status: dir };
      return { createdAt: dir };
    })();

    [rows, total] = await Promise.all([
      db.order.findMany({
        where,
        orderBy,
        skip: offset,
        take: pageSize,
        include: includeAccounts,
      }),
      db.order.count({ where }),
    ]);
  }

  const orderIds = rows.map((r) => r.id);

  const summaryMap: Record<number, { firstProductName: string | null; itemCount: number }> = {};

  if (orderIds.length > 0) {
    const keyRows = await db.key.findMany({
      where: { orderId: { in: orderIds } },
      select: { orderId: true, product: { select: { name: true } } },
      orderBy: [{ orderId: "asc" }, { product: { name: "asc" } }],
    });

    const countPerOrder: Record<number, number> = {};
    const firstNamePerOrder: Record<number, string> = {};

    for (const k of keyRows) {
      if (k.orderId == null) continue;
      countPerOrder[k.orderId] = (countPerOrder[k.orderId] ?? 0) + 1;
      if (!(k.orderId in firstNamePerOrder)) {
        firstNamePerOrder[k.orderId] = k.product.name;
      }
    }

    for (const id of orderIds) {
      summaryMap[id] = {
        firstProductName: firstNamePerOrder[id] ?? null,
        itemCount: countPerOrder[id] ?? 0,
      };
    }
  }

  const data: OrderListRow[] = rows.map((r) => {
    const counterparty = role === "buyer" ? r.seller : r.buyer;
    return {
      id: r.id,
      status: r.status,
      totalSats: r.totalSats,
      createdAt: r.createdAt.toISOString(),
      completedAt: r.completedAt ? r.completedAt.toISOString() : null,
      lastActivityAt: computeLastActivity(r).toISOString(),
      escrowAddress: r.escrowAddress,
      counterpartyPubkey: counterparty.pubkey,
      counterpartyUsername: counterparty.username,
      productSummary: {
        firstProductName: summaryMap[r.id]?.firstProductName ?? null,
        itemCount: summaryMap[r.id]?.itemCount ?? 0,
      },
    };
  });

  return { data, total, page, pageSize };
}

// ─── Admin list types ─────────────────────────────────────────────────────────

export type DisputeListRow = {
  id: number;
  status: string;
  escrowStatus: string | null;
  totalSats: number;
  createdAt: string;
  completedAt: string | null;
  escrowAddress: string | null;
  buyerPubkey: string;
  buyerUsername: string;
  sellerPubkey: string;
  sellerUsername: string;
};

export type DisputesResponse = {
  data: DisputeListRow[];
  total: number;
  page: number;
  pageSize: number;
};

// ─── queryDisputes ────────────────────────────────────────────────────────────

export async function queryDisputes(params: {
  search?: string | null;
  statuses?: string[];
  sort?: OrderSortColumn;
  dir?: SortDir;
  page?: number;
  pageSize?: number;
}): Promise<DisputesResponse> {
  const search = params.search ?? null;
  const statuses = params.statuses ?? [];
  const sort = params.sort ?? "createdAt";
  const dir = params.dir ?? "desc";
  const page = Math.max(1, params.page ?? 1);
  const pageSize = Math.min(100, Math.max(1, params.pageSize ?? 20));
  const offset = (page - 1) * pageSize;

  const orderBy: Prisma.OrderOrderByWithRelationInput = (() => {
    if (sort === "totalSats") return { totalSats: dir };
    if (sort === "status") return { status: dir };
    return { createdAt: dir };
  })();

  const where: Prisma.OrderWhereInput = {
    ...(statuses.length > 0 ? { status: { in: statuses } } : {}),
    ...(search != null && search.length > 0
      ? {
          OR: [
            { buyer: { username: { contains: search, mode: "insensitive" } } },
            { seller: { username: { contains: search, mode: "insensitive" } } },
            { buyerPubkey: { contains: search, mode: "insensitive" } },
            { sellerPubkey: { contains: search, mode: "insensitive" } },
          ],
        }
      : {}),
  };

  const [rows, total] = await Promise.all([
    db.order.findMany({
      where,
      orderBy,
      skip: offset,
      take: pageSize,
      include: {
        buyer: { select: { pubkey: true, username: true } },
        seller: { select: { pubkey: true, username: true } },
        escrow: { select: { status: true } },
      },
    }),
    db.order.count({ where }),
  ]);

  const data: DisputeListRow[] = rows.map((r) => ({
    id: r.id,
    status: r.status,
    escrowStatus: r.escrow?.status ?? null,
    totalSats: r.totalSats,
    createdAt: r.createdAt.toISOString(),
    completedAt: r.completedAt ? r.completedAt.toISOString() : null,
    escrowAddress: r.escrowAddress,
    buyerPubkey: r.buyer.pubkey,
    buyerUsername: r.buyer.username,
    sellerPubkey: r.seller.pubkey,
    sellerUsername: r.seller.username,
  }));

  return { data, total, page, pageSize };
}

// ─── queryOrderDetailAsAdmin ──────────────────────────────────────────────────

export async function queryOrderDetailAsAdmin(params: {
  orderId: number;
}): Promise<OrderDetail | null> {
  const { orderId } = params;

  const orderRow = await db.order.findUnique({
    where: { id: orderId },
    include: { chat: { select: { id: true } } },
  });

  if (!orderRow) return null;

  const [buyerAccount, sellerAccount] = await Promise.all([
    db.account.findUnique({
      where: { pubkey: orderRow.buyerPubkey },
      select: { pubkey: true, username: true },
    }),
    db.account.findUnique({
      where: { pubkey: orderRow.sellerPubkey },
      select: { pubkey: true, username: true },
    }),
  ]);

  const keyRows = await db.key.findMany({
    where: { orderId },
    include: { product: { select: { id: true, name: true, slug: true } } },
    orderBy: { id: "asc" },
  });

  // The admin sees decrypted key codes while the order is under dispute, or afterwards if it
  // adjudicated the dispute — same confidentiality gate as chat/attachments. Outside that, null.
  const adminMaySeeCodes = mayAdminReadOrder(orderRow);
  const items: OrderDetailItem[] = keyRows.map((k) => ({
    keyId: k.id,
    code: adminMaySeeCodes ? safeDecryptCode(k.code) : null,
    productId: k.product.id,
    productName: k.product.name,
    productSlug: k.product.slug,
    price: k.price,
    refunded: k.refunded,
  }));

  const escrowRow = orderRow.escrowAddress
    ? await db.escrow.findUnique({ where: { address: orderRow.escrowAddress } })
    : null;

  const escrow: OrderEscrowDetail | null = escrowRow
    ? {
        address: escrowRow.address,
        status: escrowRow.status,
        price: escrowRow.price,
        buyerPubkey: escrowRow.buyerPubkey,
        sellerPubkey: escrowRow.sellerPubkey,
        arbiterPubkey: escrowRow.arbiterPubkey,
        serverPubkey: escrowRow.serverPubkey,
        exitDelay: escrowRow.exitDelay,
        nonce: escrowRow.nonce,
        sellerSignedCollabPsbt: escrowRow.sellerSignedCollabPsbt,
        releaseCheckpointPsbts: parsePsbtArray(escrowRow.releaseCheckpointPsbts),
        collabArkTxid: escrowRow.collabArkTxid,
        serverSignedCheckpoints: parsePsbtArray(escrowRow.serverSignedCheckpoints),
        buyerSignedCheckpoints: parsePsbtArray(escrowRow.buyerSignedCheckpoints),
        fundedAt: escrowRow.fundedAt ? escrowRow.fundedAt.toISOString() : null,
        releasedAt: escrowRow.releasedAt ? escrowRow.releasedAt.toISOString() : null,
        disputeArkTxid: escrowRow.disputeArkTxid,
        disputeAdminSignedCheckpoints: parsePsbtArray(escrowRow.disputeAdminSignedCheckpoints),
        settledAt: escrowRow.settledAt ? escrowRow.settledAt.toISOString() : null,
      }
    : null;

  return {
    id: orderRow.id,
    status: orderRow.status,
    totalSats: orderRow.totalSats,
    platformFee: orderRow.platformFee,
    adminDisputeShare: orderRow.adminDisputeShare,
    createdAt: orderRow.createdAt.toISOString(),
    completedAt: orderRow.completedAt ? orderRow.completedAt.toISOString() : null,
    escrowAddress: orderRow.escrowAddress,
    escrow,
    chatId: orderRow.chat?.id ?? null,
    role: "seller",
    buyer: {
      pubkey: buyerAccount?.pubkey ?? orderRow.buyerPubkey,
      username: buyerAccount?.username ?? "—",
    },
    seller: {
      pubkey: sellerAccount?.pubkey ?? orderRow.sellerPubkey,
      username: sellerAccount?.username ?? "—",
    },
    items,
    refundAmount: orderRow.refundAmount,
    conclusionStatus: orderRow.conclusionStatus,
    favouredRole: orderRow.favouredRole,
    refundSignature: orderRow.refundSignature,
    concludedAt: orderRow.concludedAt ? orderRow.concludedAt.toISOString() : null,
  };
}

// ─── queryOrderDetail ─────────────────────────────────────────────────────────

export async function queryOrderDetail(params: {
  pubkey: string;
  orderId: number;
}): Promise<OrderDetail | null> {
  const { pubkey, orderId } = params;

  const orderRow = await db.order.findFirst({
    where: {
      id: orderId,
      OR: [{ buyerPubkey: pubkey }, { sellerPubkey: pubkey }],
    },
    include: { chat: { select: { id: true } } },
  });

  if (!orderRow) return null;

  const role: OrderRole = orderRow.buyerPubkey === pubkey ? "buyer" : "seller";

  const [buyerAccount, sellerAccount] = await Promise.all([
    db.account.findUnique({
      where: { pubkey: orderRow.buyerPubkey },
      select: { pubkey: true, username: true },
    }),
    db.account.findUnique({
      where: { pubkey: orderRow.sellerPubkey },
      select: { pubkey: true, username: true },
    }),
  ]);

  const keyRows = await db.key.findMany({
    where: { orderId },
    include: { product: { select: { id: true, name: true, slug: true } } },
    orderBy: { id: "asc" },
  });

  const escrowRow = orderRow.escrowAddress
    ? await db.escrow.findUnique({ where: { address: orderRow.escrowAddress } })
    : null;

  const escrow: OrderEscrowDetail | null = escrowRow
    ? {
        address: escrowRow.address,
        status: escrowRow.status,
        price: escrowRow.price,
        buyerPubkey: escrowRow.buyerPubkey,
        sellerPubkey: escrowRow.sellerPubkey,
        arbiterPubkey: escrowRow.arbiterPubkey,
        serverPubkey: escrowRow.serverPubkey,
        exitDelay: escrowRow.exitDelay,
        nonce: escrowRow.nonce,
        sellerSignedCollabPsbt: escrowRow.sellerSignedCollabPsbt,
        releaseCheckpointPsbts: parsePsbtArray(escrowRow.releaseCheckpointPsbts),
        collabArkTxid: escrowRow.collabArkTxid,
        serverSignedCheckpoints: parsePsbtArray(escrowRow.serverSignedCheckpoints),
        buyerSignedCheckpoints: parsePsbtArray(escrowRow.buyerSignedCheckpoints),
        fundedAt: escrowRow.fundedAt ? escrowRow.fundedAt.toISOString() : null,
        releasedAt: escrowRow.releasedAt ? escrowRow.releasedAt.toISOString() : null,
        disputeArkTxid: escrowRow.disputeArkTxid,
        disputeAdminSignedCheckpoints: parsePsbtArray(escrowRow.disputeAdminSignedCheckpoints),
        settledAt: escrowRow.settledAt ? escrowRow.settledAt.toISOString() : null,
      }
    : null;

  const items: OrderDetailItem[] = keyRows.map((k) => ({
    keyId: k.id,
    code: role === "seller" || k.buyerPubkey !== null ? safeDecryptCode(k.code) : null,
    productId: k.product.id,
    productName: k.product.name,
    productSlug: k.product.slug,
    price: k.price,
    refunded: k.refunded,
  }));

  return {
    id: orderRow.id,
    status: orderRow.status,
    totalSats: orderRow.totalSats,
    platformFee: orderRow.platformFee,
    adminDisputeShare: orderRow.adminDisputeShare,
    createdAt: orderRow.createdAt.toISOString(),
    completedAt: orderRow.completedAt ? orderRow.completedAt.toISOString() : null,
    escrowAddress: orderRow.escrowAddress,
    escrow,
    chatId: orderRow.chat?.id ?? null,
    role,
    buyer: {
      pubkey: buyerAccount?.pubkey ?? orderRow.buyerPubkey,
      username: buyerAccount?.username ?? "—",
    },
    seller: {
      pubkey: sellerAccount?.pubkey ?? orderRow.sellerPubkey,
      username: sellerAccount?.username ?? "—",
    },
    items,
    refundAmount: orderRow.refundAmount,
    conclusionStatus: orderRow.conclusionStatus,
    favouredRole: orderRow.favouredRole,
    refundSignature: orderRow.refundSignature,
    concludedAt: orderRow.concludedAt ? orderRow.concludedAt.toISOString() : null,
  };
}
