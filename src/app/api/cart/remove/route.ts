import { signedRoute } from "@/lib/auth/signed-route";
import { removeFromCartSchema } from "@/validators";
import { releaseCartItems } from "@/lib/backend/mutations-cart";

export const DELETE = signedRoute({
  schema: removeFromCartSchema,
  signer: "session",
  handler: async ({ payload, pubkey }) => {
    const result = await releaseCartItems({ buyerPubkey: pubkey, productId: payload.productId });
    return Response.json({ released: result.released });
  },
});
