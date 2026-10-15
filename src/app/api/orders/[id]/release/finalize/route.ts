import { signedRoute } from "@/lib/auth/signed-route";
import { finalizeRelease } from "@/lib/backend/mutations-orders";
import { finalizeReleaseSchema } from "@/validators";

export const POST = signedRoute({
  schema: finalizeReleaseSchema,
  signer: "session",
  handler: async ({ pubkey, params }) => {
    const orderId = parseInt(params.id, 10);
    if (isNaN(orderId)) {
      return Response.json({ error: "Invalid order ID" }, { status: 400 });
    }

    const result = await finalizeRelease({ orderId, sellerPubkey: pubkey });

    if ("error" in result) {
      return Response.json({ error: result.error }, { status: result.status });
    }

    return Response.json({ ok: true });
  },
});
