import { NextRequest, NextResponse } from "next/server";
import { requireSessionRoute } from "@/lib/auth/session";
import { readEscrowFunding } from "@/lib/backend/query-orders";

/**
 * Read-only escrow funding for the live funding bar: `{ total, price, funded }` from the indexer.
 * Does NOT mutate the escrow status (that is the job of `POST /orders/[id]/verify-funding`).
 */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireSessionRoute();
  if (!auth.ok) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const orderId = parseInt(id, 10);
  if (isNaN(orderId)) {
    return Response.json({ error: "Invalid order ID" }, { status: 400 });
  }

  const result = await readEscrowFunding({
    orderId,
    pubkey: auth.session.user.pubkey,
    isAdmin: auth.session.user.isAdmin === true,
  });

  if ("error" in result) {
    return Response.json({ error: result.error }, { status: result.status });
  }

  return Response.json(result);
}
