import "server-only";

import { db } from "@/db";
import { safeDecryptCode } from "@/lib/crypto/symmetric";

export type StockProduct = {
  productId: number;
  name: string;
  slug: string;
  availableKeysCount: number;
  lowestPrice: number;
  highestPrice: number;
  priceTiers: number;
};

export type StockProductsResponse = {
  data: StockProduct[];
  total: number;
  page: number;
  pageSize: number;
};

export type StockSortColumn = "name" | "availableKeysCount" | "lowestPrice";
export type SortDir = "asc" | "desc";

export type StockTier = {
  price: number;
  availableCount: number;
};

export type StockKey = {
  id: string;
  code: string | null;
  createdAt: Date;
};

export async function queryStockProducts(params: {
  sellerPubkey: string;
  search?: string | null;
  sort?: StockSortColumn;
  dir?: SortDir;
  page?: number;
  pageSize?: number;
}): Promise<StockProductsResponse> {
  const { sellerPubkey } = params;
  const search = params.search ?? null;
  const sort = params.sort ?? "name";
  const dir = params.dir ?? "asc";
  const page = Math.max(1, params.page ?? 1);
  const pageSize = Math.min(100, Math.max(1, params.pageSize ?? 50));
  const offset = (page - 1) * pageSize;
  const now = new Date();

  const hasSearch = search != null && search.length > 0;

  const keyWhere = {
    sellerPubkey,
    orderId: null,
    OR: [{ reservedUntil: null }, { reservedUntil: { lte: now } }],
    ...(hasSearch
      ? { product: { name: { contains: search!, mode: "insensitive" as const } } }
      : {}),
  };

  // Group by (productId, price) to derive per-product aggregates in JS.
  // This is the only way to get COUNT(DISTINCT price) via Prisma groupBy.
  const tiers = await db.key.groupBy({
    by: ["productId", "price"],
    where: keyWhere,
    _count: { id: true },
  });

  if (tiers.length === 0) {
    return { data: [], total: 0, page, pageSize };
  }

  // Collapse to per-product aggregates.
  const productMap = new Map<
    number,
    { availableKeysCount: number; lowestPrice: number; highestPrice: number; priceTiers: number }
  >();

  for (const tier of tiers) {
    const existing = productMap.get(tier.productId);
    const count = tier._count.id;
    if (!existing) {
      productMap.set(tier.productId, {
        availableKeysCount: count,
        lowestPrice: tier.price,
        highestPrice: tier.price,
        priceTiers: 1,
      });
    } else {
      existing.availableKeysCount += count;
      if (tier.price < existing.lowestPrice) existing.lowestPrice = tier.price;
      if (tier.price > existing.highestPrice) existing.highestPrice = tier.price;
      existing.priceTiers += 1;
    }
  }

  const productIds = Array.from(productMap.keys());

  // Fetch product metadata.
  const products = await db.product.findMany({
    where: { id: { in: productIds } },
    select: { id: true, name: true, slug: true },
  });

  // Merge.
  const merged: StockProduct[] = products.map((p) => {
    const agg = productMap.get(p.id)!;
    return {
      productId: p.id,
      name: p.name,
      slug: p.slug,
      availableKeysCount: agg.availableKeysCount,
      lowestPrice: agg.lowestPrice,
      highestPrice: agg.highestPrice,
      priceTiers: agg.priceTiers,
    };
  });

  // Sort in JS (computed columns not sortable via Prisma orderBy).
  const collator = new Intl.Collator("en");
  merged.sort((a, b) => {
    let cmp = 0;
    if (sort === "availableKeysCount") {
      cmp = a.availableKeysCount - b.availableKeysCount;
    } else if (sort === "lowestPrice") {
      cmp = a.lowestPrice - b.lowestPrice;
    } else {
      cmp = collator.compare(a.name, b.name);
    }
    return dir === "desc" ? -cmp : cmp;
  });

  const total = merged.length;
  const data = merged.slice(offset, offset + pageSize);

  return { data, total, page, pageSize };
}

export async function queryStockTiers(params: {
  sellerPubkey: string;
  productId: number;
}): Promise<StockTier[]> {
  const { sellerPubkey, productId } = params;
  const now = new Date();

  const rows = await db.key.groupBy({
    by: ["price"],
    where: {
      sellerPubkey,
      productId,
      orderId: null,
      OR: [{ reservedUntil: null }, { reservedUntil: { lte: now } }],
    },
    _count: { id: true },
    orderBy: { price: "asc" },
  });

  return rows.map((r) => ({ price: r.price, availableCount: r._count.id }));
}

export async function queryStockTier(params: {
  sellerPubkey: string;
  productId: number;
  price: number;
}): Promise<{ price: number; availableCount: number; keys: StockKey[] } | null> {
  const { sellerPubkey, productId, price } = params;
  const now = new Date();

  const rows = await db.key.findMany({
    where: {
      sellerPubkey,
      productId,
      price,
      orderId: null,
      OR: [{ reservedUntil: null }, { reservedUntil: { lte: now } }],
    },
    select: { id: true, code: true, createdAt: true },
    orderBy: { createdAt: "asc" },
  });

  if (rows.length === 0) return null;

  return {
    price,
    availableCount: rows.length,
    keys: rows.map((r) => ({
      id: String(r.id),
      code: safeDecryptCode(r.code),
      createdAt: r.createdAt,
    })),
  };
}

export async function tierExists(params: {
  sellerPubkey: string;
  productId: number;
  price: number;
}): Promise<boolean> {
  const { sellerPubkey, productId, price } = params;
  const now = new Date();

  const row = await db.key.findFirst({
    where: {
      sellerPubkey,
      productId,
      price,
      orderId: null,
      OR: [{ reservedUntil: null }, { reservedUntil: { lte: now } }],
    },
    select: { id: true },
  });

  return row !== null;
}
