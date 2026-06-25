import { NextRequest, NextResponse } from "next/server";
import { requireSessionRoute } from "@/lib/auth/session";
import { verifySignedJsonBody } from "@/lib/auth/verify-signed-json-body";
import { addToCartSchema } from "@/validators";
import { reserveKeys } from "@/lib/backend/mutations-cart";

export async function POST(req: NextRequest) {
  const auth = await requireSessionRoute();
  if (!auth.ok) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const buyerPubkey = auth.session.user.pubkey;

  const parsed = await verifySignedJsonBody(req, buyerPubkey, addToCartSchema);
  const { productId, quantity, sellerPubkey, price } = parsed;

  const { reserved, expiresAt } = await reserveKeys({
    buyerPubkey,
    productId,
    quantity,
    sellerPubkey,
    price,
  });

  return Response.json({
    reserved: reserved,
    expiresAt: expiresAt.toISOString(),
  });
}
