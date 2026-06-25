import "server-only";

import { db } from "@/db";

export type CartTier = {
  sellerPubkey: string;
  sellerUsername: string;
  price: number;
  quantity: number;
  keyIds: number[];
};

export type CartProduct = {
  productId: number;
  productName: string;
  totalQuantity: number;
  totalSubtotal: number;
  expiresAt: Date;
  tiers: CartTier[];
};

export type CartQueryResult = {
  products: CartProduct[];
  earliestExpiry: Date | null;
};

export async function queryCart(buyerPubkey: string): Promise<CartQueryResult> {
  const now = new Date();

  const keys = await db.key.findMany({
    where: {
      reservedBy: buyerPubkey,
      reservedUntil: { gte: now },
    },
    include: {
      product: { select: { id: true, name: true, imageUrl: true } },
      seller: { select: { pubkey: true, username: true } },
    },
    orderBy: [{ productId: "asc" }, { price: "asc" }],
  });

  if (keys.length < 1) {
    return { products: [], earliestExpiry: null };
  }

  // Group keys by (productId, sellerPubkey, price) tier
  type TierGroup = {
    productId: number;
    productName: string;
    sellerPubkey: string;
    sellerUsername: string;
    price: number;
    keyIds: number[];
    expiresAt: Date;
  };

  const tierMap = new Map<string, TierGroup>();

  for (const key of keys) {
    // reservedUntil is guaranteed non-null by the `gt: now` filter
    const expiresAt = key.reservedUntil!;
    const tierKey = `${key.productId}:${key.sellerPubkey}:${key.price}`;

    const existing = tierMap.get(tierKey);
    if (!existing) {
      tierMap.set(tierKey, {
        productId: key.productId,
        productName: key.product.name,
        sellerPubkey: key.seller.pubkey,
        sellerUsername: key.seller.username,
        price: key.price,
        keyIds: [key.id],
        expiresAt,
      });
    } else {
      existing.keyIds.push(key.id);
      if (expiresAt < existing.expiresAt) {
        existing.expiresAt = expiresAt;
      }
    }
  }

  // Aggregate tiers into CartProduct (same logic as before)
  const productMap = new Map<number, CartProduct>();

  for (const tier of tierMap.values()) {
    const quantity = tier.keyIds.length;
    const existing = productMap.get(tier.productId);

    if (!existing) {
      productMap.set(tier.productId, {
        productId: tier.productId,
        productName: tier.productName,
        totalQuantity: quantity,
        totalSubtotal: tier.price * quantity,
        expiresAt: tier.expiresAt,
        tiers: [
          {
            sellerPubkey: tier.sellerPubkey,
            sellerUsername: tier.sellerUsername,
            price: tier.price,
            quantity,
            keyIds: tier.keyIds,
          },
        ],
      });
    } else {
      existing.totalQuantity += quantity;
      existing.totalSubtotal += tier.price * quantity;
      if (tier.expiresAt < existing.expiresAt) {
        existing.expiresAt = tier.expiresAt;
      }
      existing.tiers.push({
        sellerPubkey: tier.sellerPubkey,
        sellerUsername: tier.sellerUsername,
        price: tier.price,
        quantity,
        keyIds: tier.keyIds,
      });
    }
  }

  const products = Array.from(productMap.values());

  const earliestExpiry = products.reduce<Date>(
    (acc, p) => (p.expiresAt < acc ? p.expiresAt : acc),
    products[0].expiresAt
  );

  return { products, earliestExpiry };
}
