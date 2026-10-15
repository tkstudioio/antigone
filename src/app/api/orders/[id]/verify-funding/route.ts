import { signedRoute } from "@/lib/auth/signed-route";
import { verifyEscrowFunding } from "@/lib/backend/mutations-orders";
import { verifyFundingSchema } from "@/validators";

export const POST = signedRoute({
  schema: verifyFundingSchema,
  signer: "session",
  handler: async ({ pubkey, params }) => {
    const orderId = parseInt(params.id, 10);
    if (isNaN(orderId)) {
      return Response.json({ error: "Invalid order ID" }, { status: 400 });
    }

    const result = await verifyEscrowFunding({ orderId, pubkey });

    if ("error" in result) {
      return Response.json({ error: result.error }, { status: result.status });
    }

    return Response.json({
      ok: true,
      funded: result.funded,
      total: result.total,
      escrowStatus: result.escrowStatus,
    });
  },
});
