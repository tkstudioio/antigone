import { db } from "@/db";
import { getEscrowFunding } from "@/lib/ark/funding";
import { signedRoute } from "@/lib/auth/signed-route";
import { cancelUnpaidOrder, isPaymentExpired } from "@/lib/backend/mutations-order-expiry";
import { cancelOrderSchema } from "@/validators";

/**
 * Cancel an unpaid order. The buyer may cancel while the escrow is unfunded; the seller only once
 * the payment TTL has elapsed. Same funding gate as the sweeper: the indexer must report zero
 * locked funds (funds locked -> 409, indexer unreachable -> 503: never cancel on a failed reading).
 */
export const POST = signedRoute({
  schema: cancelOrderSchema,
  signer: "session",
  handler: async ({ payload, pubkey, params }) => {
    const orderId = parseInt(params.id, 10);
    if (isNaN(orderId)) {
      return Response.json({ error: "Invalid order ID" }, { status: 400 });
    }
    if (payload.orderId !== orderId) {
      return Response.json({ error: "Order ID mismatch" }, { status: 400 });
    }

    const order = await db.order.findUnique({
      where: { id: orderId },
      include: { escrow: true },
    });
    if (!order) return Response.json({ error: "Order not found" }, { status: 404 });

    const isBuyer = order.buyerPubkey === pubkey;
    const isSeller = order.sellerPubkey === pubkey;
    if (!isBuyer && !isSeller) {
      return Response.json({ error: "Unauthorized access" }, { status: 403 });
    }

    if (order.status !== "pending") {
      return Response.json({ error: "Only pending orders can be cancelled" }, { status: 409 });
    }
    const escrow = order.escrow;
    if (!escrow || (escrow.status !== "awaitingFunds" && escrow.status !== "partiallyFunded")) {
      return Response.json({ error: "The escrow is already funded" }, { status: 409 });
    }

    if (!isBuyer && !isPaymentExpired(order.createdAt)) {
      return Response.json(
        { error: "The seller can cancel only after the payment deadline has passed" },
        { status: 403 }
      );
    }

    let funding;
    try {
      funding = await getEscrowFunding(escrow.address, escrow.price);
    } catch (err) {
      console.error(`cancel order ${orderId}: indexer unreachable:`, err);
      return Response.json(
        { error: "Cannot verify the escrow funding right now, please try again later" },
        { status: 503 }
      );
    }
    if (funding.total > 0) {
      return Response.json(
        { error: "Funds are already locked in the escrow: the order cannot be cancelled" },
        { status: 409 }
      );
    }

    const result = await cancelUnpaidOrder({
      orderId,
      actor: isBuyer ? "buyer" : "seller",
    });
    if ("error" in result) {
      return Response.json({ error: result.error }, { status: result.status });
    }

    return Response.json({ ok: true });
  },
});
