import { NextRequest, NextResponse } from "next/server";
import { requireSessionRoute } from "@/lib/auth/session";
import { queryOrderDetail } from "@/lib/backend/query-orders";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireSessionRoute();
  if (!auth.ok) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id: idStr } = await params;

  const orderId = parseInt(idStr, 10);

  if (isNaN(orderId)) {
    return Response.json({ error: "Order not found" }, { status: 404 });
  }

  const pubkey = auth.session.user.pubkey;
  const detail = await queryOrderDetail({ pubkey, orderId });
  if (!detail) {
    return Response.json({ error: "Order not found" }, { status: 404 });
  }

  return Response.json(detail);
}
