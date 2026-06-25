import { NextRequest, NextResponse } from "next/server";
import { requireSessionRoute } from "@/lib/auth/session";
import { verifySignedJsonBody } from "@/lib/auth/verify-signed-json-body";
import { removeFromCartSchema } from "@/validators";
import { releaseCartItems } from "@/lib/backend/mutations-cart";

export async function DELETE(req: NextRequest) {
  const auth = await requireSessionRoute();
  if (!auth.ok) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const buyerPubkey = auth.session.user.pubkey;

  let parsed: Awaited<ReturnType<typeof verifySignedJsonBody<typeof removeFromCartSchema>>>;
  try {
    parsed = await verifySignedJsonBody(req, buyerPubkey, removeFromCartSchema);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Invalid signature";
    const status = message.includes("Invalid signature") ? 400 : 422;
    return Response.json({ error: message }, { status });
  }

  const { productId } = parsed;

  const result = await releaseCartItems({ buyerPubkey, productId });
  return Response.json({ released: result.released });
}
