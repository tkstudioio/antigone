import { NextRequest, NextResponse } from "next/server";
import { requireSessionRoute } from "@/lib/auth/session";
import { verifySignedJsonBody } from "@/lib/auth/verify-signed-json-body";
import { deleteKeysSchema } from "@/validators";
import { deleteKeysFromStock } from "@/lib/backend/mutations-stocks";

export async function DELETE(req: NextRequest) {
  const auth = await requireSessionRoute();
  if (!auth.ok) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const sellerPubkey = auth.session.user.pubkey;

  let parsed: Awaited<ReturnType<typeof verifySignedJsonBody<typeof deleteKeysSchema>>>;
  try {
    parsed = await verifySignedJsonBody(req, sellerPubkey, deleteKeysSchema);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Invalid signature";
    const status = message.includes("Invalid signature") ? 400 : 422;
    return Response.json({ error: message }, { status });
  }

  const { keyIds } = parsed;

  const result = await deleteKeysFromStock({ sellerPubkey, keyIds });

  if (result.deleted === 0) {
    return Response.json({ error: "Some keys are no longer available" }, { status: 409 });
  }

  return Response.json({ deleted: result.deleted, notFound: result.notFound });
}
