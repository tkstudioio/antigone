import { NextRequest, NextResponse } from "next/server";
import { requireSessionRoute } from "@/lib/auth/session";
import { queryStockTiers, queryStockTier } from "@/lib/backend/query-stocks";
import { db } from "@/db";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ productId: string }> }
) {
  const auth = await requireSessionRoute();
  if (!auth.ok) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { productId: productIdStr } = await params;
  const productId = parseInt(productIdStr, 10);

  if (isNaN(productId)) {
    return Response.json({ error: "Invalid product" }, { status: 400 });
  }

  const productRow = await db.product.findUnique({
    where: { id: productId },
    select: { id: true, name: true, slug: true },
  });

  if (!productRow) {
    return Response.json({ error: "Product not found" }, { status: 404 });
  }

  const sellerPubkey = auth.session.user.pubkey;
  const tiers = await queryStockTiers({ sellerPubkey, productId });

  const priceParam = req.nextUrl.searchParams.get("price");
  let tierKeys = null;
  if (priceParam !== null) {
    const price = parseInt(priceParam, 10);
    if (!isNaN(price)) {
      tierKeys = await queryStockTier({ sellerPubkey, productId, price });
    }
  }

  return Response.json({
    product: { id: productRow.id, name: productRow.name, slug: productRow.slug },
    tiers,
    tierKeys,
  });
}
