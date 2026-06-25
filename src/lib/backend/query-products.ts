import "server-only";

import { db } from "@/db";
import type { ProductsResponse, SortColumn, SortDir } from "@/hooks/products";

export async function queryProducts(params: {
  search?: string | null;
  sort?: SortColumn;
  dir?: SortDir;
  page?: number;
  pageSize?: number;

  withStock?: boolean;
}): Promise<ProductsResponse> {
  const search = params.search ?? null;
  const sort = params.sort ?? "name";
  const dir = params.dir ?? "asc";
  const page = Math.max(1, params.page ?? 1);
  const pageSize = Math.min(100, Math.max(1, params.pageSize ?? 50));
  const offset = (page - 1) * pageSize;
  const withStock = params.withStock ?? false;

  const now = new Date();

  const nameFilter =
    search != null && search.length > 0
      ? { name: { contains: search, mode: "insensitive" as const } }
      : undefined;

  // Pass 1 — product rows (name/rating sort applied here when possible)
  const productOrderBy = (() => {
    if (sort === "name") return { name: dir };
    if (sort === "rating") return { rating: dir };
    // price sort is computed from keys — applied in JS after merge
    return { name: dir };
  })();

  const products = await db.product.findMany({
    where: nameFilter,
    select: { id: true, name: true, slug: true, description: true, rating: true, imageUrl: true },
    orderBy: productOrderBy,
  });

  // Pass 2 — key stock aggregates per productId
  const keyGroups = await db.key.groupBy({
    by: ["productId"],
    where: {
      ...(nameFilter ? { product: nameFilter } : {}),
      orderId: null,
      OR: [{ reservedUntil: null }, { reservedUntil: { lte: now } }],
    },
    _count: { id: true },
    _min: { price: true },
  });

  // Build a lookup map: productId → { availableKeysCount, lowestPrice }
  const stockMap = new Map(
    keyGroups.map((g) => [
      g.productId,
      {
        availableKeysCount: g._count.id,
        lowestPrice: g._min.price ?? null,
      },
    ])
  );

  // Merge products with stock data
  type MergedRow = {
    id: number;
    name: string;
    slug: string;
    description: string | null;
    rating: number | null;
    imageUrl: string | null;
    lowestPrice: number | null;
    availableKeysCount: number;
  };

  let merged: MergedRow[] = products.map((p) => {
    const stock = stockMap.get(p.id);
    return {
      id: p.id,
      name: p.name,
      slug: p.slug,
      description: p.description,
      rating: p.rating,
      imageUrl: p.imageUrl,
      availableKeysCount: stock?.availableKeysCount ?? 0,
      lowestPrice: stock?.lowestPrice ?? null,
    };
  });

  // Apply price sort in JS (NULLS LAST in both asc and desc directions)
  if (sort === "price") {
    merged.sort((a, b) => {
      const pa = a.lowestPrice;
      const pb = b.lowestPrice;
      if (pa === null && pb === null) return 0;
      if (pa === null) return 1; // nulls last
      if (pb === null) return -1; // nulls last
      return dir === "asc" ? pa - pb : pb - pa;
    });
  }

  // withStock filter — keep only products that have available keys
  if (withStock) {
    merged = merged.filter((r) => r.availableKeysCount > 0);
  }

  // Total count
  let total: number;
  if (withStock) {
    total = merged.length;
  } else if (search != null && search.length > 0) {
    total = await db.product.count({
      where: { name: { contains: search, mode: "insensitive" } },
    });
  } else {
    total = await db.product.count();
  }

  // Paginate
  const data = merged.slice(offset, offset + pageSize);

  return { data, total, page, pageSize, pageCount: Math.ceil(total / pageSize) };
}
