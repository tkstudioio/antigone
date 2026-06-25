import { NextRequest, NextResponse } from "next/server";
import { requireSessionRoute } from "@/lib/auth/session";
import { verifySignedJsonBody } from "@/lib/auth/verify-signed-json-body";
import { startDisputeExit } from "@/lib/backend/mutations-dispute";
import { disputeExitSchema } from "@/validators";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireSessionRoute();
  if (!auth.ok) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const orderId = parseInt(id, 10);
  if (isNaN(orderId)) {
    return Response.json({ error: "Invalid order ID" }, { status: 400 });
  }

  const pubkey = auth.session.user.pubkey;

  try {
    await verifySignedJsonBody(req, pubkey, disputeExitSchema);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Invalid signature";
    const status = message.includes("Invalid signature") ? 401 : 422;
    return Response.json({ error: message }, { status });
  }

  const result = await startDisputeExit(orderId, pubkey);

  return Response.json({ error: result.error }, { status: result.status });
}
