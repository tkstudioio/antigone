import { NextRequest, NextResponse } from "next/server";
import { requireSessionRoute } from "@/lib/auth/session";
import { verifySignedJsonBody } from "@/lib/auth/verify-signed-json-body";
import { clearCartSchema } from "@/validators";
import { queryCart } from "@/lib/backend/query-cart";
import { clearCart } from "@/lib/backend/mutations-cart";

export async function GET() {
  const auth = await requireSessionRoute();
  if (!auth.ok) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const buyerPubkey = auth.session.user.pubkey;
  const result = await queryCart(buyerPubkey);

  return Response.json({
    products: result.products.map((product) => ({
      ...product,
      expiresAt: product.expiresAt.toISOString(),
      tiers: product.tiers.map((t) => ({ ...t })),
    })),
    earliestExpiry: result.earliestExpiry ? result.earliestExpiry.toISOString() : null,
  });
}

export async function DELETE(req: NextRequest) {
  const auth = await requireSessionRoute();
  if (!auth.ok) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const buyerPubkey = auth.session.user.pubkey;

  await verifySignedJsonBody(req, buyerPubkey, clearCartSchema);

  const result = await clearCart(buyerPubkey);
  return Response.json({ released: result.released });
}
