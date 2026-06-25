import "server-only";

import { db } from "@/db";

export type StockEntry = {
  productId: number;
  sellerPubkey: string;
  sellerUsername: string;
  price: number;
  availableCount: number;
};

export type ProductDetail = {
  id: number;
  name: string;
  slug: string;
  description: string | null;
  rating: number | null;
  imageUrl: string | null;
  stocks: StockEntry[];
};

export async function queryProductDetail(slug: string): Promise<ProductDetail | null> {
  const productRow = await db.product.findUnique({
    where: { slug },
    select: { id: true, name: true, slug: true, description: true, rating: true, imageUrl: true },
  });

  if (!productRow) return null;

  const now = new Date();

  const groups = await db.key.groupBy({
    by: ["sellerPubkey", "price"],
    where: {
      productId: productRow.id,
      orderId: null,
      OR: [{ reservedUntil: null }, { reservedUntil: { lte: now } }],
    },
    _count: { id: true },
    orderBy: [{ price: "asc" }, { sellerPubkey: "asc" }],
  });

  const distinctSellerPubkeys = [...new Set(groups.map((g) => g.sellerPubkey))];

  const accounts = await db.account.findMany({
    where: { pubkey: { in: distinctSellerPubkeys } },
    select: { pubkey: true, username: true },
  });

  const usernameByPubkey = new Map(accounts.map((a) => [a.pubkey, a.username]));

  const stocks: StockEntry[] = groups
    .map((g) => ({
      productId: productRow.id,
      sellerPubkey: g.sellerPubkey,
      sellerUsername: usernameByPubkey.get(g.sellerPubkey) ?? "—",
      price: g.price,
      availableCount: g._count.id,
    }))
    .sort((a, b) => {
      if (a.price !== b.price) return a.price - b.price;
      return a.sellerUsername.localeCompare(b.sellerUsername, "en");
    });

  return {
    id: productRow.id,
    name: productRow.name,
    slug: productRow.slug,
    description: productRow.description,
    rating: productRow.rating,
    imageUrl: productRow.imageUrl,
    stocks,
  };
}
