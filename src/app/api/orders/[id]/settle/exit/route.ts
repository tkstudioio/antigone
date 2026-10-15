import { signedRoute } from "@/lib/auth/signed-route";
import { startDisputeExit } from "@/lib/backend/mutations-dispute";
import { disputeExitSchema } from "@/validators";

export const POST = signedRoute({
  schema: disputeExitSchema,
  signer: "session",
  handler: async ({ pubkey, params }) => {
    const orderId = parseInt(params.id, 10);
    if (isNaN(orderId)) {
      return Response.json({ error: "Invalid order ID" }, { status: 400 });
    }

    const result = await startDisputeExit(orderId, pubkey);

    return Response.json({ error: result.error }, { status: result.status });
  },
});
