import "server-only";

import { db } from "@/db";

const RESERVATION_MINUTES = 10;

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
      throw new Error(`Not enough keys: available ${candidates.length}, requested ${quantity}`);
    }

    for (const { id } of candidates) {
      await tx.key.update({
        where: { id },
        data: { reservedBy: buyerPubkey, reservedUntil: expiresAt },
      });
    }

    return { reserved: candidates.length, expiresAt };
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
