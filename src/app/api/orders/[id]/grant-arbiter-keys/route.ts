import { signedRoute } from "@/lib/auth/signed-route";
import { grantArbiterKeys } from "@/lib/backend/mutations-orders";
import { grantArbiterKeysSchema } from "@/validators";

// A dispute party re-wraps the content keys it can open toward the escrow arbiter. The recipient is
// resolved server-side from the escrow (never from the client).
export const POST = signedRoute({
  schema: grantArbiterKeysSchema,
  signer: "session",
  handler: async ({ payload, pubkey, params, action }) => {
    const orderId = parseInt(params.id, 10);
    if (isNaN(orderId)) {
      return Response.json({ error: "Invalid order ID" }, { status: 400 });
    }

    const result = await grantArbiterKeys({
      orderId,
      pubkey,
      keys: payload.keys,
      actionId: action.id,
    });

    if ("error" in result) {
      return Response.json({ error: result.error }, { status: result.status });
    }

    return Response.json({ ok: true });
  },
});
