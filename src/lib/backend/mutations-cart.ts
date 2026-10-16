import "server-only";

import { db } from "@/db";
import { MAX_RESERVED_KEYS_PER_ACCOUNT } from "@/lib/backend/limits";

const RESERVATION_MINUTES = 10;

/** Not enough sellable keys matched the request (or a concurrent reservation took them). */
export class NotEnoughKeysError extends Error {}

/** The reservation would exceed {@link MAX_RESERVED_KEYS_PER_ACCOUNT}. */
export class ReservationCapError extends Error {}

export async function reserveKeys(params: {
  buyerPubkey: string;
  productId: number;
  quantity: number;
  sellerPubkey?: string;
  price?: number;
}): Promise<{ reserved: number; expiresAt: Date }> {
  const { buyerPubkey, productId, quantity, sellerPubkey, price } = params;

  return await db.$transaction(async (tx) => {
    const now = new Date();
    const expiresAt = new Date(now.getTime() + RESERVATION_MINUTES * 60 * 1000);

    const candidates = await tx.key.findMany({
      where: {
        productId,
        // An archived product accepts no new reservations.
        product: { archivedAt: null },
        orderId: null,
        OR: [{ reservedUntil: null }, { reservedUntil: { lte: now } }],
        // When a specific stock is requested, pin both the seller and the exact
        // price so the buyer never pays a different tier than the one shown.
        ...(sellerPubkey !== undefined ? { sellerPubkey } : {}),
        ...(price !== undefined ? { price } : {}),
      },
      select: { id: true },
      orderBy: [{ price: "asc" }, { id: "asc" }],
      take: quantity,
    });

    if (candidates.length < quantity) {
      throw new NotEnoughKeysError(
        `Not enough keys: available ${candidates.length}, requested ${quantity}`
      );
    }

    // Per-account cap on live reservations (counted inside the same transaction).
    const alreadyReserved = await tx.key.count({
      where: { reservedBy: buyerPubkey, orderId: null, reservedUntil: { gte: now } },
    });
    if (alreadyReserved + quantity > MAX_RESERVED_KEYS_PER_ACCOUNT) {
      throw new ReservationCapError(
        `Reservation limit exceeded: at most ${MAX_RESERVED_KEYS_PER_ACCOUNT} keys can be reserved at once (you hold ${alreadyReserved})`
      );
    }

    // Conditional claim: the availability filter is repeated in the UPDATE, so a key taken by a
    // concurrent reservation between the read above and this write simply does not match.
    const claimed = await tx.key.updateMany({
      where: {
        id: { in: candidates.map(({ id }) => id) },
        orderId: null,
        OR: [{ reservedUntil: null }, { reservedUntil: { lte: now } }],
      },
      data: { reservedBy: buyerPubkey, reservedUntil: expiresAt },
    });
    if (claimed.count !== quantity) {
      throw new NotEnoughKeysError("Some keys were just taken by another buyer, please try again");
    }

    return { reserved: claimed.count, expiresAt };
  });
}

export async function releaseCartItems(params: {
  buyerPubkey: string;
  productId: number;
}): Promise<{ released: number }> {
  const { buyerPubkey, productId } = params;

  const result = await db.key.updateMany({
    where: { reservedBy: buyerPubkey, productId },
    data: { reservedBy: null, reservedUntil: null },
  });

  return { released: result.count };
}

export async function clearCart(buyerPubkey: string): Promise<{ released: number }> {
  const result = await db.key.updateMany({
    where: { reservedBy: buyerPubkey },
    data: { reservedBy: null, reservedUntil: null },
  });

  return { released: result.count };
}
