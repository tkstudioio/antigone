import { signedRoute } from "@/lib/auth/signed-route";
import { addToCartSchema } from "@/validators";
import { reserveKeys } from "@/lib/backend/mutations-cart";

export const POST = signedRoute({
  schema: addToCartSchema,
  signer: "session",
  handler: async ({ payload, pubkey }) => {
    const { productId, quantity, sellerPubkey, price } = payload;

    const { reserved, expiresAt } = await reserveKeys({
      buyerPubkey: pubkey,
      productId,
      quantity,
      sellerPubkey,
      price,
    });

    return Response.json({
      reserved: reserved,
      expiresAt: expiresAt.toISOString(),
    });
  },
});
