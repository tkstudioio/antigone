import { NextRequest, NextResponse } from "next/server";
import { requireSessionRoute } from "@/lib/auth/session";
import { verifySignedJsonBody } from "@/lib/auth/verify-signed-json-body";
import { prepareDisputeSettlement } from "@/lib/backend/mutations-dispute";
import { settleDisputePrepareSchema } from "@/validators";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireSessionRoute();
  if (!auth.ok) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const orderId = parseInt(id, 10);
  if (isNaN(orderId)) {
    return Response.json({ error: "Invalid order ID" }, { status: 400 });
  }

  const pubkey = auth.session.user.pubkey;

  let parsed: Awaited<ReturnType<typeof verifySignedJsonBody<typeof settleDisputePrepareSchema>>>;
  try {
    parsed = await verifySignedJsonBody(req, pubkey, settleDisputePrepareSchema);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Invalid signature";
    const status = message.includes("Invalid signature") ? 401 : 422;
    return Response.json({ error: message }, { status });
  }

  const result = await prepareDisputeSettlement({
    orderId,
    pubkey,
    favouredSignedArkPsbt: parsed.favouredSignedArkPsbt,
    checkpointPsbts: parsed.checkpointPsbts,
  });

  if ("error" in result) {
    return Response.json({ error: result.error }, { status: result.status });
  }

  return Response.json({
    disputeArkTxid: result.disputeArkTxid,
    adminSignedCheckpoints: result.adminSignedCheckpoints,
  });
}
