import { signedRoute } from "@/lib/auth/signed-route";
import { prepareDisputeSettlement } from "@/lib/backend/mutations-dispute";
import { settleDisputePrepareSchema } from "@/validators";

// Step 1 of the dispute settlement (favoured party). The server validates and persists the
// favoured-signed PSBT for the arbiter to co-sign; it signs nothing and never calls the operator.
export const POST = signedRoute({
  schema: settleDisputePrepareSchema,
  signer: "session",
  handler: async ({ payload, pubkey, params }) => {
    const orderId = parseInt(params.id, 10);
    if (isNaN(orderId)) {
      return Response.json({ error: "Invalid order ID" }, { status: 400 });
    }

    const result = await prepareDisputeSettlement({
      orderId,
      pubkey,
      favouredSignedArkPsbt: payload.favouredSignedArkPsbt,
      checkpointPsbts: payload.checkpointPsbts,
    });

    if ("error" in result) {
      return Response.json({ error: result.error }, { status: result.status });
    }

    return Response.json({ ok: true });
  },
});
