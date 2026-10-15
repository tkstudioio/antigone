import { NextResponse } from "next/server";
import { requireSessionRoute } from "@/lib/auth/session";
import { signedRoute } from "@/lib/auth/signed-route";
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

export const DELETE = signedRoute({
  schema: clearCartSchema,
  signer: "session",
  handler: async ({ pubkey }) => {
    const result = await clearCart(pubkey);
    return Response.json({ released: result.released });
  },
});
