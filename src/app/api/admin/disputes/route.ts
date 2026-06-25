import { NextRequest } from "next/server";
import { requireAdminRoute } from "@/lib/auth/session";
import { queryDisputes } from "@/lib/backend/query-orders";

export async function GET(req: NextRequest) {
  const auth = await requireAdminRoute();
  if (!auth.ok) return auth.response;

  const { searchParams } = req.nextUrl;
  const page = parseInt(searchParams.get("page") ?? "1", 10);
  const pageSize = parseInt(searchParams.get("pageSize") ?? "20", 10);
  const search = searchParams.get("search") ?? undefined;
  const sort = (searchParams.get("sort") ?? "createdAt") as "createdAt" | "totalSats" | "status";
  const dir = (searchParams.get("dir") ?? "desc") as "asc" | "desc";

  const result = await queryDisputes({
    page: isNaN(page) ? 1 : page,
    pageSize: isNaN(pageSize) ? 20 : pageSize,
    search: search || null,
    statuses: ["disputed", "concluded"],
    sort,
    dir,
  });

  return Response.json(result);
}
