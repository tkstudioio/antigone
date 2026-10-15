import { signedRoute } from "@/lib/auth/signed-route";
import { finalizeDisputeSettlement } from "@/lib/backend/mutations-dispute";
import { settleDisputeFinalizeSchema } from "@/validators";

// Step 3 of the dispute settlement (favoured party). The browser already called `finalizeTx` on the
// operator; this only records the terminal state.
export const POST = signedRoute({
  schema: settleDisputeFinalizeSchema,
  signer: "session",
  handler: async ({ payload, pubkey, params }) => {
    const orderId = parseInt(params.id, 10);
    if (isNaN(orderId)) {
      return Response.json({ error: "Invalid order ID" }, { status: 400 });
    }

    const result = await finalizeDisputeSettlement({
      orderId,
      pubkey,
      disputeArkTxid: payload.disputeArkTxid,
    });

    if ("error" in result) {
      return Response.json({ error: result.error }, { status: result.status });
    }

    return Response.json({ ok: true });
  },
});
