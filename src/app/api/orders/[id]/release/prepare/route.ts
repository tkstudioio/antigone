import { signedRoute } from "@/lib/auth/signed-route";
import { prepareRelease } from "@/lib/backend/mutations-orders";
import { prepareReleaseSchema } from "@/validators";

export const POST = signedRoute({
  schema: prepareReleaseSchema,
  signer: "session",
  handler: async ({ payload, pubkey, params }) => {
    const orderId = parseInt(params.id, 10);
    if (isNaN(orderId)) {
      return Response.json({ error: "Invalid order ID" }, { status: 400 });
    }

    const result = await prepareRelease({
      orderId,
      sellerPubkey: pubkey,
      sellerSignedCollabPsbt: payload.sellerSignedCollabPsbt,
      checkpointPsbts: payload.checkpointPsbts,
    });

    if ("error" in result) {
      return Response.json({ error: result.error }, { status: result.status });
    }

    return Response.json({ ok: true });
  },
});
