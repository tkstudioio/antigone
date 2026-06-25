import { NextRequest, NextResponse } from "next/server";
import { requireSessionRoute } from "@/lib/auth/session";
import { verifySignedJsonBody } from "@/lib/auth/verify-signed-json-body";
import { openChatSchema } from "@/validators";
import { canOpenDispute } from "@/lib/escrow-status";
import { findOrderForChat, findChatByOrderId, createChatForOrder } from "@/lib/backend/query-chat";

export async function POST(req: NextRequest) {
  const auth = await requireSessionRoute();
  if (!auth.ok) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const pubkey = auth.session.user.pubkey;

  let parsed: Awaited<ReturnType<typeof verifySignedJsonBody<typeof openChatSchema>>>;
  try {
    parsed = await verifySignedJsonBody(req, pubkey, openChatSchema);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Invalid signature";
    const status = message.includes("Invalid signature") ? 401 : 422;
    return Response.json({ error: message }, { status });
  }

  const { orderId, signature } = parsed;

  const orderResult = await findOrderForChat({ pubkey, orderId });

  if (!orderResult.ok) {
    if ("notFound" in orderResult) {
      return Response.json({ error: "Order not found" }, { status: 404 });
    }
    return Response.json({ error: "Unauthorized access" }, { status: 403 });
  }

  const { order } = orderResult;

  const existing = await findChatByOrderId(orderId);
  if (existing) {
    return Response.json(
      {
        id: existing.id,
        orderId: existing.orderId,
        buyerPubkey: order.buyerPubkey,
        sellerPubkey: order.sellerPubkey,
        status: existing.status,
        createdAt: existing.createdAt.toISOString(),
      },
      { status: 200 }
    );
  }

  // A new dispute can only be opened while one is still allowed (funds locked, release pending).
  // Existing chats are returned above, so this only blocks NEW disputes after the window closes
  // (e.g. once the buyer has collaborated) — for both parties.
  if (!canOpenDispute(order.status, order.escrowStatus)) {
    return Response.json(
      { error: "Cannot open a dispute for this order" },
      { status: 409 }
    );
  }

  const chat = await createChatForOrder({ orderId, signature });

  return Response.json(
    {
      id: chat.id,
      orderId: chat.orderId,
      buyerPubkey: order.buyerPubkey,
      sellerPubkey: order.sellerPubkey,
      status: chat.status,
      createdAt: chat.createdAt.toISOString(),
    },
    { status: 201 }
  );
}
