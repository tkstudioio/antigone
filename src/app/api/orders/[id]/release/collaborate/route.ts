import { signedRoute } from "@/lib/auth/signed-route";
import { collaborateRelease } from "@/lib/backend/mutations-orders";
import { collaborateReleaseSchema } from "@/validators";

export const POST = signedRoute({
  schema: collaborateReleaseSchema,
  signer: "session",
  handler: async ({ payload, pubkey, params }) => {
    const orderId = parseInt(params.id, 10);
    if (isNaN(orderId)) {
      return Response.json({ error: "Invalid order ID" }, { status: 400 });
    }

    const result = await collaborateRelease({
      orderId,
      buyerPubkey: pubkey,
      collabArkTxid: payload.collabArkTxid,
      serverSignedCheckpoints: payload.serverSignedCheckpoints,
      buyerSignedCheckpoints: payload.buyerSignedCheckpoints,
    });

    if ("error" in result) {
      return Response.json({ error: result.error }, { status: result.status });
    }

    return Response.json({ ok: true });
  },
});
