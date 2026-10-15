import { signedRoute } from "@/lib/auth/signed-route";
import { concludeOrderAsAdmin } from "@/lib/backend/mutations-orders";
import { concludeDisputeSchema } from "@/validators";

// The `admin` signer gates on `session.user.isAdmin` (403 for non-admins, before verification) and
// verifies the signature against the admin session's pubkey.
export const POST = signedRoute({
  schema: concludeDisputeSchema,
  signer: "admin",
  handler: async ({ payload, params, action }) => {
    const orderId = parseInt(params.id, 10);
    if (isNaN(orderId)) {
      return Response.json({ error: "Invalid dispute ID" }, { status: 400 });
    }

    if (payload.orderId !== orderId) {
      return Response.json({ error: "Order ID mismatch" }, { status: 400 });
    }

    const result = await concludeOrderAsAdmin({
      orderId: payload.orderId,
      refundAmount: payload.refundAmount,
      conclusionStatus: payload.conclusionStatus,
      favouredRole: payload.favouredRole,
      refundedKeyIds: payload.refundedKeyIds,
      refundSignature: action.signature,
      actionId: action.id,
    });

    if ("error" in result) {
      return Response.json({ error: result.error }, { status: result.status });
    }

    return Response.json({ ok: true });
  },
});
