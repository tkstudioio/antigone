import { signedRoute } from "@/lib/auth/signed-route";
import { confirmOrder } from "@/lib/backend/mutations-orders";
import { confirmOrderSchema } from "@/validators";

// Seller confirmation = delivery: the body carries one content-key wrap toward the buyer for every
// key of the order (ciphertext only — the signed body persisted in `SignedAction` is the evidence).
export const POST = signedRoute({
  schema: confirmOrderSchema,
  signer: "session",
  handler: async ({ payload, pubkey, params, action }) => {
    const orderId = parseInt(params.id, 10);
    if (isNaN(orderId)) {
      return Response.json({ error: "Invalid order ID" }, { status: 400 });
    }

    const result = await confirmOrder({
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
