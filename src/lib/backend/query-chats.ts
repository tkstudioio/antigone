import "server-only";

import { db } from "@/db";
import { Prisma } from "@prisma/client";

// ─── Admin chats types ────────────────────────────────────────────────────────

export type AdminChatRow = {
  id: number;
  orderId: number;
  status: string;
  createdAt: string;
  buyerPubkey: string;
  sellerPubkey: string;
  buyerUsername: string | null;
  sellerUsername: string | null;
  totalSats: number;
  messageCount: number;
};

export type AdminChatsResponse = {
  data: AdminChatRow[];
  total: number;
  page: number;
  pageSize: number;
};

export type AdminChatsSort = "createdAt" | "totalSats" | "status";

export type SortDir = "asc" | "desc";

export async function queryChats(params: {
  search?: string | null;
  sort?: string | null;
  dir?: string | null;
  page?: number | null;
  pageSize?: number | null;
}): Promise<AdminChatsResponse> {
  const ALLOWED_SORTS: AdminChatsSort[] = ["createdAt", "totalSats", "status"];
  const sort: AdminChatsSort = ALLOWED_SORTS.includes(params.sort as AdminChatsSort)
    ? (params.sort as AdminChatsSort)
    : "createdAt";
  const dir: SortDir = params.dir === "asc" ? "asc" : "desc";
  const page = Math.max(1, params.page ?? 1);
  const pageSize = Math.min(100, Math.max(1, params.pageSize ?? 20));
  const skip = (page - 1) * pageSize;

  const search = params.search?.trim() || undefined;

  const where: Prisma.ChatWhereInput = search
    ? {
        order: {
          OR: [
            { buyer: { username: { contains: search, mode: "insensitive" } } },
            { seller: { username: { contains: search, mode: "insensitive" } } },
          ],
        },
      }
    : {};

  let orderBy: Prisma.ChatOrderByWithRelationInput;
  if (sort === "totalSats") {
    orderBy = { order: { totalSats: dir } };
  } else if (sort === "status") {
    orderBy = { order: { status: dir } };
  } else {
    orderBy = { createdAt: dir };
  }

  const [rows, total] = await Promise.all([
    db.chat.findMany({
      where,
      orderBy,
      skip,
      take: pageSize,
      include: {
        order: {
          include: {
            buyer: { select: { username: true } },
            seller: { select: { username: true } },
          },
        },
        _count: { select: { messages: true } },
      },
    }),
    db.chat.count({ where }),
  ]);

  const data: AdminChatRow[] = rows.map((row) => ({
    id: row.id,
    orderId: row.orderId,
    status: row.status,
    createdAt: row.createdAt.toISOString(),
    buyerPubkey: row.order.buyerPubkey,
    sellerPubkey: row.order.sellerPubkey,
    buyerUsername: row.order.buyer?.username ?? null,
    sellerUsername: row.order.seller?.username ?? null,
    totalSats: row.order.totalSats,
    messageCount: row._count.messages,
  }));

  return { data, total, page, pageSize };
}
