import "server-only";

import { db } from "@/db";
import { getEscrowFunding } from "@/lib/ark/funding";
import { ORDER_PAYMENT_TTL_MINUTES } from "@/lib/backend/limits";
import { EXPIRY_WARNING_WINDOW_MS } from "@/lib/backend/query-orders";

const ORDER_PAYMENT_TTL_MS = ORDER_PAYMENT_TTL_MINUTES * 60_000;

/** Escrow statuses in which an order is still waiting for (full) payment. */
const UNPAID_ESCROW_STATUSES = ["awaitingFunds", "partiallyFunded"] as const;

export type CancelActor = "system" | "buyer" | "seller";

export type SweepResult = {
  scanned: number;
  cancelled: number;
  promoted: number;
  expiringSoon: number;
  skipped: number;
  errors: number;
};

/** True once an order created at `createdAt` is past its payment deadline. */
export function isPaymentExpired(createdAt: Date, now: number = Date.now()): boolean {
  return createdAt.getTime() + ORDER_PAYMENT_TTL_MS < now;
}

/**
 * Cancel an unpaid order: order -> `cancelled`, keys back on sale, chat closed with a system
 * message. Every write is conditional and runs in ONE transaction. The escrow is deliberately left
 * as is (`awaitingFunds`): the dead escrow is identified by its order being `cancelled`.
 *
 * The caller is responsible for the funding check (indexer reports 0 locked) BEFORE calling this:
 * it is a network call and must never run inside the DB transaction.
 */
export async function cancelUnpaidOrder(params: {
  orderId: number;
  actor: CancelActor;
}): Promise<{ ok: true } | { error: string; status: number }> {
  const { orderId, actor } = params;

  return db.$transaction(async (tx) => {
    const moved = await tx.order.updateMany({
      where: { id: orderId, status: "pending" },
      data: { status: "cancelled" },
    });
    if (moved.count === 0) {
      return { error: "Order is no longer pending", status: 409 };
    }

    await tx.key.updateMany({
      where: { orderId },
      data: { orderId: null, reservedBy: null, reservedUntil: null },
    });

    const chat = await tx.chat.findUnique({ where: { orderId }, select: { id: true } });
    if (chat) {
      await tx.chat.update({ where: { id: chat.id }, data: { status: "closed" } });
      const by =
        actor === "system" ? "automatically" : actor === "buyer" ? "by the buyer" : "by the seller";
      await tx.message.create({
        data: {
          chatId: chat.id,
          message: `Order cancelled ${by} because the payment was not received.`,
          isSystem: true,
        },
      });
    }

    return { ok: true as const };
  });
}

/**
 * Sweep unpaid orders past the payment TTL. The `awaitingFunds -> fundLocked` promotion is
 * client-driven, so an order in `awaitingFunds` MAY ALREADY BE PAID on Ark: the indexer is always
 * asked first and nothing is cancelled unless it reports zero locked funds (fail closed on errors).
 */
export async function sweepExpiredOrders(opts: { limit?: number } = {}): Promise<SweepResult> {
  const limit = opts.limit ?? 100;
  const now = Date.now();
  const result: SweepResult = {
    scanned: 0,
    cancelled: 0,
    promoted: 0,
    expiringSoon: 0,
    skipped: 0,
    errors: 0,
  };

  const candidates = await db.order.findMany({
    where: {
      status: "pending",
      createdAt: { lt: new Date(now - ORDER_PAYMENT_TTL_MS) },
      escrow: { status: { in: [...UNPAID_ESCROW_STATUSES] } },
    },
    include: { escrow: true },
    orderBy: { createdAt: "asc" },
    take: limit,
  });

  for (const order of candidates) {
    const escrow = order.escrow;
    if (!escrow) continue;
    result.scanned++;

    let funding;
    try {
      funding = await getEscrowFunding(escrow.address, escrow.price);
    } catch (err) {
      console.error(`[expire-orders] indexer failed for order ${order.id}, skipping:`, err);
      result.errors++;
      continue;
    }

    if (funding.soonestExpiry != null && funding.soonestExpiry - now < EXPIRY_WARNING_WINDOW_MS) {
      result.expiringSoon++;
      console.warn(
        `[expire-orders] order ${order.id} batch expiry is near: ${new Date(funding.soonestExpiry).toISOString()}`
      );
    }

    if (funding.funded) {
      // Already paid: never cancel. Promote it the same way the buyer's browser would have.
      await db.escrow.updateMany({
        where: { address: escrow.address, status: { in: [...UNPAID_ESCROW_STATUSES] } },
        data: { status: "fundLocked", fundedAt: new Date() },
      });
      result.promoted++;
      continue;
    }

    if (funding.total > 0) {
      // Partially funded: funds are at stake, a human must look. Touch nothing.
      console.warn(
        `[expire-orders] order ${order.id} is partially funded (${funding.total}/${escrow.price} sats): skipped`
      );
      result.skipped++;
      continue;
    }

    try {
      const res = await cancelUnpaidOrder({ orderId: order.id, actor: "system" });
      if ("ok" in res) result.cancelled++;
      else result.skipped++;
    } catch (err) {
      console.error(`[expire-orders] cancelling order ${order.id} failed:`, err);
      result.errors++;
    }
  }

  return result;
}
