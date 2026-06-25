import { queryProducts } from "@/lib/backend/query-products";
import { NextRequest } from "next/server";

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;

  const search = searchParams.get("search") || null;
  const sortParam = searchParams.get("sort") ?? "name";
  const sort = (["name", "price", "rating"] as const).includes(
    sortParam as "name" | "price" | "rating"
  )
    ? (sortParam as "name" | "price" | "rating")
    : "name";
  const dir: "asc" | "desc" = searchParams.get("dir") === "desc" ? "desc" : "asc";
  const page = Math.max(1, parseInt(searchParams.get("page") ?? "1", 10) || 1);
  const pageSizeRaw = parseInt(searchParams.get("pageSize") ?? "50", 10) || 50;
  const pageSize = Math.min(100, Math.max(1, pageSizeRaw));

  const withStockRaw = searchParams.get("withStock");
  const withStock = withStockRaw === "1" || withStockRaw === "true";

  const result = await queryProducts({ search, sort, dir, page, pageSize, withStock });
  return Response.json(result);
}
