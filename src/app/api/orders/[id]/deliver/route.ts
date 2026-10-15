import { signedRoute } from "@/lib/auth/signed-route";
import { deliverOrderKeys } from "@/lib/backend/mutations-orders";
import { deliverKeysSchema } from "@/validators";

// Seller delivers the keys while the order is pending or in dispute (e.g. a dispute opened before
// confirmation). Same payload as confirm; no order status change.
export const POST = signedRoute({
  schema: deliverKeysSchema,
  signer: "session",
  handler: async ({ payload, pubkey, params, action }) => {
    const orderId = parseInt(params.id, 10);
    if (isNaN(orderId)) {
      return Response.json({ error: "Invalid order ID" }, { status: 400 });
    }

    const result = await deliverOrderKeys({
      sellerPubkey: pubkey,
      orderId,
      keys: payload.keys,
      actionId: action.id,
    });

    if ("error" in result) {
      return Response.json({ error: result.error }, { status: result.status });
    }

    return Response.json({ ok: true });
  },
});
