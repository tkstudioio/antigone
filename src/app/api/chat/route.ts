import { signedRoute } from "@/lib/auth/signed-route";
import { openChatSchema } from "@/validators";
import { canOpenDispute } from "@/lib/escrow-status";
import { findOrderForChat, findChatByOrderId, createChatForOrder } from "@/lib/backend/query-chat";

export const POST = signedRoute({
  schema: openChatSchema,
  signer: "session",
  handler: async ({ payload, pubkey, action }) => {
    const { orderId } = payload;

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
      return Response.json({ error: "Cannot open a dispute for this order" }, { status: 409 });
    }

    const chat = await createChatForOrder({ orderId, signature: action.signature });

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
  },
});
