import { NextRequest, NextResponse } from "next/server";
import { requireSessionRoute } from "@/lib/auth/session";
import { signedRoute } from "@/lib/auth/signed-route";
import { createStockSchema, updateStockPriceSchema, deleteStockSchema } from "@/validators";
import { queryStockProducts } from "@/lib/backend/query-stocks";
import { upsertStockKeys, updateStockPrice, deleteStock } from "@/lib/backend/mutations-stocks";
import { db } from "@/db";
import type { StockSortColumn, SortDir } from "@/lib/backend/query-stocks";

export async function GET(req: NextRequest) {
  const auth = await requireSessionRoute();
  if (!auth.ok) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = req.nextUrl;
  const search = searchParams.get("search") || null;

  const sortParam = searchParams.get("sort") ?? "name";
  const sort: StockSortColumn = (["name", "availableKeysCount", "lowestPrice"] as const).includes(
    sortParam as StockSortColumn
  )
    ? (sortParam as StockSortColumn)
    : "name";

  const dir: SortDir = searchParams.get("dir") === "desc" ? "desc" : "asc";
  const page = Math.max(1, parseInt(searchParams.get("page") ?? "1", 10) || 1);
  const pageSizeRaw = parseInt(searchParams.get("pageSize") ?? "50", 10) || 50;
  const pageSize = Math.min(100, Math.max(1, pageSizeRaw));

  const sellerPubkey = auth.session.user.pubkey;
  const result = await queryStockProducts({ sellerPubkey, search, sort, dir, page, pageSize });
  return Response.json(result);
}

export const POST = signedRoute({
  schema: createStockSchema,
  signer: "session",
  handler: async ({ payload, pubkey: sellerPubkey }) => {
    const { productId, price, codes } = payload;

    const productRow = await db.product.findUnique({
      where: { id: productId },
      select: { id: true, slug: true, archivedAt: true },
    });

    if (!productRow) {
      return Response.json({ error: "Product not found" }, { status: 404 });
    }

    if (productRow.archivedAt !== null) {
      return Response.json(
        { error: "This product has been archived and accepts no new stock" },
        { status: 409 }
      );
    }

    if (codes.length > 1000) {
      return Response.json({ error: "Maximum 1000 keys per request" }, { status: 422 });
    }

    if (codes.length === 0) {
      return Response.json({ error: "Enter at least one key" }, { status: 422 });
    }

    // The codes arrive already E2E-encrypted (trimmed and hashed in the seller's browser): the signed
    // body persisted in `SignedAction` therefore holds ciphertext only.
    const result = await upsertStockKeys({ sellerPubkey, productId, price, codes });

    return Response.json({
      inserted: result.inserted,
      skipped: result.skipped,
      isNew: result.isNew,
      productSlug: productRow.slug,
    });
  },
});

export const PATCH = signedRoute({
  schema: updateStockPriceSchema,
  signer: "session",
  handler: async ({ payload, pubkey: sellerPubkey }) => {
    const { productId, oldPrice, newPrice } = payload;

    const result = await updateStockPrice({ sellerPubkey, productId, oldPrice, newPrice });

    if (result.updated === 0) {
      return Response.json({ error: "Stock not found" }, { status: 404 });
    }

    return Response.json({ updated: result.updated, newPrice, merged: result.merged });
  },
});

export const DELETE = signedRoute({
  schema: deleteStockSchema,
  signer: "session",
  handler: async ({ payload, pubkey: sellerPubkey }) => {
    const { productId, price } = payload;

    const result = await deleteStock({ sellerPubkey, productId, price });

    if (result.deleted === 0) {
      return Response.json({ error: "No deletable keys (all in escrow)" }, { status: 409 });
    }

    return Response.json({ deleted: result.deleted });
  },
});
