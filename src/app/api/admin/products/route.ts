import { NextRequest } from "next/server";
import { requireAdminRoute } from "@/lib/auth/session";
import { signedRoute } from "@/lib/auth/signed-route";
import { createProductSchema } from "@/validators";
import { createProduct } from "@/lib/backend/mutations-products";
import {
  queryAdminProducts,
  type AdminProductSort,
  type AdminProductStatus,
} from "@/lib/backend/query-admin-products";

const STATUSES: readonly AdminProductStatus[] = ["active", "archived", "all"];
const SORTS: readonly AdminProductSort[] = ["createdAt", "name"];

export async function GET(req: NextRequest) {
  const auth = await requireAdminRoute();
  if (!auth.ok) return auth.response;

  const { searchParams } = req.nextUrl;
  const statusParam = searchParams.get("status") as AdminProductStatus | null;
  const sortParam = searchParams.get("sort") as AdminProductSort | null;
  const dirParam = searchParams.get("dir");

  const result = await queryAdminProducts({
    search: searchParams.get("search"),
    status: statusParam && STATUSES.includes(statusParam) ? statusParam : "active",
    sort: sortParam && SORTS.includes(sortParam) ? sortParam : "createdAt",
    dir: dirParam === "asc" || dirParam === "desc" ? dirParam : undefined,
    page: parseInt(searchParams.get("page") ?? "1", 10) || 1,
    pageSize: parseInt(searchParams.get("pageSize") ?? "20", 10) || 20,
  });

  return Response.json(result);
}

export const POST = signedRoute({
  schema: createProductSchema,
  signer: "admin",
  handler: async ({ payload }) => {
    const result = await createProduct(payload);
    if ("error" in result) {
      return Response.json({ error: result.error }, { status: result.status });
    }
    return Response.json(result, { status: 201 });
  },
});
