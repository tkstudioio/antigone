import { signedRoute } from "@/lib/auth/signed-route";
import { openDispute } from "@/lib/backend/mutations-orders";
import { openDisputeSchema } from "@/validators";

export const POST = signedRoute({
  schema: openDisputeSchema,
  signer: "session",
  handler: async ({ pubkey, params, action }) => {
    const orderId = parseInt(params.id, 10);
    if (isNaN(orderId)) {
      return Response.json({ error: "Invalid order ID" }, { status: 400 });
    }

    const result = await openDispute({
      orderId,
      pubkey,
      signature: action.signature,
      actionId: action.id,
    });

    if ("error" in result) {
      return Response.json({ error: result.error }, { status: result.status });
    }

    return Response.json({ ok: true });
  },
});
