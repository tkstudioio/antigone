import { NextRequest, NextResponse } from "next/server";
import { requireSessionRoute } from "@/lib/auth/session";
import { queryOrders } from "@/lib/backend/query-orders";
import type { OrderRole, OrderSortColumn, SortDir } from "@/lib/backend/query-orders";

export async function GET(req: NextRequest) {
  const auth = await requireSessionRoute();
  if (!auth.ok) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = req.nextUrl;

  const role = searchParams.get("role") as OrderRole | null;

  const search = searchParams.get("search") || null;

  const sortParam = searchParams.get("sort") ?? "lastActivity";
  const sort: OrderSortColumn = (
    ["lastActivity", "createdAt", "totalSats", "status"] as const
  ).includes(sortParam as OrderSortColumn)
    ? (sortParam as OrderSortColumn)
    : "lastActivity";

  const dir: SortDir = searchParams.get("dir") === "asc" ? "asc" : "desc";
  const page = Math.max(1, parseInt(searchParams.get("page") ?? "1", 10) || 1);
  const pageSizeRaw = parseInt(searchParams.get("pageSize") ?? "20", 10) || 20;
  const pageSize = Math.min(100, Math.max(1, pageSizeRaw));

  const pubkey = auth.session.user.pubkey;
  const result = await queryOrders({ pubkey, role, search, sort, dir, page, pageSize });
  return Response.json(result);
}
