import "server-only";

import type { Prisma } from "@prisma/client";
import { db } from "@/db";

export type AdminProductStatus = "active" | "archived" | "all";
export type AdminProductSort = "createdAt" | "name";

export type AdminProductRow = {
  id: number;
  name: string;
  slug: string;
  description: string | null;
  rating: number | null;
  imageUrl: string | null;
  archivedAt: string | null;
  createdAt: string;
  /** Every key ever uploaded for the product, in any state. A product with keys cannot be deleted. */
  totalKeys: number;
  /** Unsold keys not under a live reservation (what the storefront would show). */
  availableKeys: number;
  /** Keys attached to an order. */
  soldKeys: number;
};

export type AdminProductsResponse = {
  data: AdminProductRow[];
  total: number;
  page: number;
  pageSize: number;
};

/** The admin's catalog list: every product (archived ones included), with key counters. */
export async function queryAdminProducts(params: {
  search?: string | null;
  status?: AdminProductStatus;
  sort?: AdminProductSort;
  dir?: "asc" | "desc";
  page?: number;
  pageSize?: number;
}): Promise<AdminProductsResponse> {
  const search = params.search?.trim() || null;
  const status = params.status ?? "active";
  const sort = params.sort ?? "createdAt";
  const dir = params.dir ?? (sort === "name" ? "asc" : "desc");
  const page = Math.max(1, params.page ?? 1);
  const pageSize = Math.min(100, Math.max(1, params.pageSize ?? 20));

  const where: Prisma.ProductWhereInput = {
    ...(search
      ? {
          OR: [
            { name: { contains: search, mode: "insensitive" } },
            { slug: { contains: search, mode: "insensitive" } },
          ],
        }
      : {}),
    ...(status === "active" ? { archivedAt: null } : {}),
    ...(status === "archived" ? { archivedAt: { not: null } } : {}),
  };

  const [products, total] = await Promise.all([
    db.product.findMany({
      where,
      orderBy: [{ [sort]: dir }, { id: dir }],
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    db.product.count({ where }),
  ]);

  const productIds = products.map((p) => p.id);
  const now = new Date();
  const [totalGroups, availableGroups, soldGroups] = await Promise.all([
    db.key.groupBy({
      by: ["productId"],
      where: { productId: { in: productIds } },
      _count: { id: true },
    }),
    db.key.groupBy({
      by: ["productId"],
      where: {
        productId: { in: productIds },
        orderId: null,
        OR: [{ reservedUntil: null }, { reservedUntil: { lte: now } }],
      },
      _count: { id: true },
    }),
    db.key.groupBy({
      by: ["productId"],
      where: { productId: { in: productIds }, orderId: { not: null } },
      _count: { id: true },
    }),
  ]);

  const toMap = (groups: { productId: number; _count: { id: number } }[]) =>
    new Map(groups.map((g) => [g.productId, g._count.id]));
  const totalMap = toMap(totalGroups);
  const availableMap = toMap(availableGroups);
  const soldMap = toMap(soldGroups);

  const data: AdminProductRow[] = products.map((p) => ({
    id: p.id,
    name: p.name,
    slug: p.slug,
    description: p.description,
    rating: p.rating,
    imageUrl: p.imageUrl,
    archivedAt: p.archivedAt?.toISOString() ?? null,
    createdAt: p.createdAt.toISOString(),
    totalKeys: totalMap.get(p.id) ?? 0,
    availableKeys: availableMap.get(p.id) ?? 0,
    soldKeys: soldMap.get(p.id) ?? 0,
  }));

  return { data, total, page, pageSize };
}
