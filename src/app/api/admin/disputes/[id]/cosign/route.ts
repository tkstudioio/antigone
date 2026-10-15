import { signedRoute } from "@/lib/auth/signed-route";
import { cosignDisputeSettlementAsAdmin } from "@/lib/backend/mutations-dispute";
import { cosignDisputeSchema } from "@/validators";

// Step 2 of the dispute settlement (arbiter). The admin's browser validated the prepared PSBT,
// signed it, submitted it to the operator and signed the returned checkpoints; the server only
// records that co-signature. The `admin` signer gates on `session.user.isAdmin` (403 otherwise,
// before verification) and verifies the signature against the admin session's pubkey.
export const POST = signedRoute({
  schema: cosignDisputeSchema,
  signer: "admin",
  handler: async ({ payload, params, pubkey }) => {
    const orderId = parseInt(params.id, 10);
    if (isNaN(orderId)) {
      return Response.json({ error: "Invalid dispute ID" }, { status: 400 });
    }

    const result = await cosignDisputeSettlementAsAdmin({
      orderId,
      adminPubkey: pubkey,
      disputeArkTxid: payload.disputeArkTxid,
      serverSignedCheckpoints: payload.serverSignedCheckpoints,
      adminSignedCheckpoints: payload.adminSignedCheckpoints,
    });

    if ("error" in result) {
      return Response.json({ error: result.error }, { status: result.status });
    }

    return Response.json({ ok: true });
  },
});
