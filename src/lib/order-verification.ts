import { deriveEscrowAddress } from "@/lib/ark/escrow";
import type { ArbiterCheck } from "@/lib/arbiter-pin";
import {
  samePubkey,
  verifySignedAction,
  type SignedActionRecord,
} from "@/lib/auth/verify-signed-action";
import { deriveConclusionStatus } from "@/lib/orders-status";
import type { OrderDetail } from "@/lib/backend/query-orders";
import {
  checkoutSchema,
  concludeDisputeSchema,
  confirmOrderSchema,
  openDisputeSchema,
} from "@/validators";

/**
 * Client-side verification of an order against the signed actions the server returned with it.
 * Isomorphic (no server-only import). The server is treated as untrusted: every user-authored fact
 * — the buyer's checkout terms, the seller's confirmation/delivery, the dispute opening, the
 * arbiter's verdict — is checked against its author's signature and the values are then read from
 * the SIGNED BODY. Server-authored data (statuses, timestamps, ids) stays unverifiable by design.
 */

/** One verified line of the buyer-signed terms. */
export type SignedTermsItem = { keyId: number; sellerPubkey: string; price: number };

export type VerifiedTerms = {
  /** The buyer: the signer of the checkout. */
  buyerPubkey: string;
  /** The signed lines that belong to THIS order (same seller and keys as the order). */
  items: SignedTermsItem[];
};

/** The arbiter's verdict as signed in the conclude request. */
export type VerifiedVerdict = {
  refundAmount: number;
  conclusionStatus: "completed" | "partially_refunded" | "cancelled";
  favouredRole: "buyer" | "seller";
  refundedKeyIds: number[];
};

export type ActionVerification<T = undefined> =
  /** The step has not happened (nothing to verify). */
  | { status: "none" }
  /** The step happened but no signed action is linked (created before the link existed). */
  | { status: "legacy" }
  | { status: "verified"; action: SignedActionRecord; body: T }
  | { status: "tampered"; reason: string };

export type OperatorCheck = "ok" | "mismatch" | "unavailable";

export type OrderVerification = {
  terms: ActionVerification<VerifiedTerms>;
  /** Seller confirmation (`/confirm`) or delivery during a dispute (`/deliver`). */
  confirm: ActionVerification<{ kind: "confirm" | "deliver" }>;
  dispute: ActionVerification;
  verdict: ActionVerification<VerifiedVerdict>;
  /** Operator pubkey from the ASP's `getInfo()` against `escrow.serverPubkey`. */
  operator: OperatorCheck;
  /** TOFU check of the escrow's arbiter (null when not applicable: arbiter viewer / no escrow). */
  arbiter: ArbiterCheck | null;
  /** The arbiter key a verdict / arbiter message must be signed by to be trusted. */
  trustedArbiterPubkey: string | null;
  /**
   * Non-null → signing, paying and settling must stay disabled; the text is shown to the user.
   * Legacy (unlinked) records and an unreachable operator do NOT block.
   */
  blocked: string | null;
};

export type OrderViewer = {
  /** The viewer's own pubkey (from the unlocked account), null while the wallet is locked. */
  pubkey: string | null;
  /** `arbiter`: the admin viewing a dispute (its own key is the arbiter). */
  kind: "party" | "arbiter";
};

const TAMPERED_BLOCK_REASON =
  "Part of this order failed signature verification and may have been tampered with by the server. Signing and payments are disabled.";

type Role = "buyer" | "seller" | "arbiter" | "unknown";

function roleOf(order: OrderDetail, viewer: OrderViewer): Role {
  if (viewer.kind === "arbiter") return "arbiter";
  // The role comes from the viewer's OWN key, never from the server's claim. Only while the wallet
  // is locked (no key to compare) the server's `role` is shown as a best effort: nothing can be
  // signed in that state anyway.
  if (!viewer.pubkey) return order.role ?? "unknown";
  if (samePubkey(viewer.pubkey, order.buyer.pubkey)) return "buyer";
  if (samePubkey(viewer.pubkey, order.seller.pubkey)) return "seller";
  return "unknown";
}

const tampered = (reason: string): { status: "tampered"; reason: string } => ({
  status: "tampered",
  reason,
});

function verifyTerms(order: OrderDetail, role: Role): OrderVerification["terms"] {
  // A role the server cannot make up: the viewer must be one of the two parties it is shown to.
  if (role === "unknown") return tampered("You are not a party of this order");

  if (!order.checkoutAction) return { status: "legacy" };

  // For the buyer, `order.buyer` was just checked to be the viewer's own key; for the seller and
  // the arbiter the buyer is whoever the order names, and the signature must come from that exact key.
  const expectedBuyer = order.buyer.pubkey;
  const verified = verifySignedAction(
    order.checkoutAction,
    { pubkey: expectedBuyer, path: "/api/cart/checkout" },
    checkoutSchema
  );
  if (!verified.ok) return tampered(verified.message);

  const signedByKey = new Map(verified.body.items.map((i) => [i.keyId, i]));
  const items: SignedTermsItem[] = [];
  let total = 0;
  for (const item of order.items) {
    const signed = signedByKey.get(item.keyId);
    if (!signed) return tampered(`Key #${item.keyId} is not part of the buyer-signed terms`);
    if (!samePubkey(signed.sellerPubkey, order.seller.pubkey)) {
      return tampered(`Key #${item.keyId} was signed for a different seller`);
    }
    if (signed.price !== item.price) {
      return tampered(`The price of key #${item.keyId} differs from the signed price`);
    }
    items.push(signed);
    total += signed.price;
  }
  // A cancelled order has released its keys back on sale, so it legitimately lists no items.
  if (order.status !== "cancelled" && total !== order.totalSats) {
    return tampered("The order total differs from the buyer-signed terms");
  }
  if (!Number.isInteger(order.platformFee) || order.platformFee < 0) {
    return tampered("The platform fee is invalid");
  }

  const escrow = order.escrow;
  if (escrow) {
    if (!samePubkey(escrow.buyerPubkey, expectedBuyer)) {
      return tampered("The escrow buyer is not the signer of the checkout");
    }
    if (!samePubkey(escrow.sellerPubkey, order.seller.pubkey)) {
      return tampered("The escrow seller differs from the signed seller");
    }
    if (escrow.price !== order.totalSats + order.platformFee) {
      return tampered("The escrow amount differs from the signed total plus the platform fee");
    }
    if (order.escrowAddress !== escrow.address) {
      return tampered("The order escrow address differs from the escrow record");
    }
    if (!escrow.arbiterPubkey || !escrow.nonce) {
      return tampered("The escrow is missing its arbiter or its script nonce");
    }
    try {
      const derived = deriveEscrowAddress({
        buyerPubkey: escrow.buyerPubkey,
        sellerPubkey: escrow.sellerPubkey,
        adminPubkey: escrow.arbiterPubkey,
        serverPubkey: escrow.serverPubkey,
        exitDelay: escrow.exitDelay,
        scriptNonce: escrow.nonce,
      });
      if (derived !== escrow.address) {
        return tampered("The escrow address does not match its parameters");
      }
    } catch {
      return tampered("The escrow parameters are invalid");
    }
  }

  return {
    status: "verified",
    action: verified.action,
    body: { buyerPubkey: expectedBuyer, items },
  };
}

function verifyConfirm(order: OrderDetail): OrderVerification["confirm"] {
  if (!order.confirmAction) return order.completedAt ? { status: "legacy" } : { status: "none" };
  const verified = verifySignedAction(
    order.confirmAction,
    {
      pubkey: order.seller.pubkey,
      path: new RegExp(`^/api/orders/${order.id}/(confirm|deliver)$`),
    },
    confirmOrderSchema
  );
  if (!verified.ok) return tampered(verified.message);
  const kind = verified.action.path.endsWith("/deliver") ? "deliver" : "confirm";
  return { status: "verified", action: verified.action, body: { kind } };
}

function verifyDispute(order: OrderDetail): OrderVerification["dispute"] {
  if (!order.disputeAction) {
    return order.status === "disputed" || order.status === "concluded"
      ? { status: "legacy" }
      : { status: "none" };
  }
  const verified = verifySignedAction(
    order.disputeAction,
    {
      pubkey: [order.buyer.pubkey, order.seller.pubkey],
      path: `/api/orders/${order.id}/dispute`,
    },
    openDisputeSchema
  );
  if (!verified.ok) return tampered(verified.message);
  return { status: "verified", action: verified.action, body: undefined };
}

function verifyVerdict(
  order: OrderDetail,
  trustedArbiter: string | null,
  terms: OrderVerification["terms"]
): OrderVerification["verdict"] {
  if (!order.verdictAction) {
    return order.conclusionStatus != null ? { status: "legacy" } : { status: "none" };
  }
  if (!trustedArbiter) return tampered("The arbiter of this order is not known");

  const verified = verifySignedAction(
    order.verdictAction,
    { pubkey: trustedArbiter, path: `/api/admin/disputes/${order.id}/conclude` },
    concludeDisputeSchema
  );
  if (!verified.ok) return tampered(verified.message);

  const body = verified.body;
  if (body.orderId !== order.id) return tampered("The verdict was signed for a different order");

  // Internal consistency of the signed verdict against the order's keys.
  const orderKeyIds = new Set(order.items.map((i) => i.keyId));
  if (body.refundedKeyIds.some((id) => !orderKeyIds.has(id))) {
    return tampered("The verdict refunds a key that is not part of the order");
  }
  if (terms.status === "verified") {
    const priceOf = new Map(terms.body.items.map((i) => [i.keyId, i.price]));
    const refunded = body.refundedKeyIds.reduce((sum, id) => sum + (priceOf.get(id) ?? 0), 0);
    if (refunded !== body.refundAmount) {
      return tampered("The signed refund does not match the prices of the refunded keys");
    }
  }
  if (
    body.conclusionStatus !== deriveConclusionStatus(body.refundedKeyIds.length, order.items.length)
  ) {
    return tampered("The signed outcome does not match the refunded keys");
  }

  // The parallel (server-authored) fields must agree with what was signed; if they do not, the
  // server is lying somewhere — show it instead of silently preferring one.
  const refundedSet = new Set(body.refundedKeyIds);
  if (
    order.refundAmount !== body.refundAmount ||
    order.favouredRole !== body.favouredRole ||
    order.conclusionStatus !== body.conclusionStatus ||
    order.items.some((i) => i.refunded !== refundedSet.has(i.keyId))
  ) {
    return tampered("The verdict reported by the server differs from the signed verdict");
  }

  return {
    status: "verified",
    action: verified.action,
    body: {
      refundAmount: body.refundAmount,
      conclusionStatus: body.conclusionStatus,
      favouredRole: body.favouredRole,
      refundedKeyIds: body.refundedKeyIds,
    },
  };
}

/**
 * Verify the signed facts of an order for one viewer.
 *
 * @param operatorPubkey the operator signer from the ASP's `getInfo()` in the browser, or null when
 *   the ASP is unreachable (reported as `unavailable`, never replaced by our API's value).
 * @param arbiter result of the TOFU pin check for the escrow's arbiter (null for the arbiter itself).
 */
export function verifyOrderDetail(params: {
  order: OrderDetail;
  viewer: OrderViewer;
  operatorPubkey: string | null;
  arbiter: ArbiterCheck | null;
}): OrderVerification {
  const { order, viewer, operatorPubkey, arbiter } = params;
  const role = roleOf(order, viewer);
  const escrowArbiter = order.escrow?.arbiterPubkey ?? null;

  // Which key a verdict must be signed by: the arbiter's own key, or — for the parties — the PINNED
  // arbiter (a changed arbiter is not trusted until the user acknowledges it).
  const trustedArbiterPubkey =
    viewer.kind === "arbiter"
      ? (viewer.pubkey ?? escrowArbiter) // locked wallet: nothing can be signed anyway
      : arbiter?.status === "mismatch"
        ? arbiter.pinned
        : escrowArbiter;

  const terms = verifyTerms(order, role);
  const confirm = verifyConfirm(order);
  const dispute = verifyDispute(order);
  const verdict = verifyVerdict(order, trustedArbiterPubkey, terms);

  let operator: OperatorCheck = "unavailable";
  if (operatorPubkey && order.escrow) {
    operator = samePubkey(operatorPubkey, order.escrow.serverPubkey) ? "ok" : "mismatch";
  }

  let blocked: string | null = null;
  if ([terms, confirm, dispute, verdict].some((v) => v.status === "tampered")) {
    blocked = TAMPERED_BLOCK_REASON;
  } else if (operator === "mismatch") {
    blocked =
      "The Arkade operator key in this escrow differs from the one the operator reports. Signing and payments are disabled.";
  } else if (
    viewer.kind === "arbiter" &&
    viewer.pubkey &&
    order.escrow &&
    !samePubkey(escrowArbiter, viewer.pubkey)
  ) {
    blocked = "The arbiter of this escrow is not your key. Signing is disabled.";
  } else if (arbiter?.status === "mismatch") {
    blocked =
      "The arbiter of this order differs from the one this browser first trusted. Acknowledge the change to continue.";
  }

  return { terms, confirm, dispute, verdict, operator, arbiter, trustedArbiterPubkey, blocked };
}

/** Whether an action backed by this verification may proceed (not blocked). */
export function isOrderActionable(verification: OrderVerification): boolean {
  return verification.blocked == null;
}
