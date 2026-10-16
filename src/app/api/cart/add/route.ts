import { signedRoute } from "@/lib/auth/signed-route";
import { addToCartSchema } from "@/validators";
import { NotEnoughKeysError, ReservationCapError, reserveKeys } from "@/lib/backend/mutations-cart";

export const POST = signedRoute({
  schema: addToCartSchema,
  signer: "session",
  handler: async ({ payload, pubkey }) => {
    const { productId, quantity, sellerPubkey, price } = payload;

    try {
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
    } catch (err) {
      if (err instanceof NotEnoughKeysError || err instanceof ReservationCapError) {
        return Response.json({ error: err.message }, { status: 409 });
      }
      throw err;
    }
  },
});
