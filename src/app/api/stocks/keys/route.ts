import { signedRoute } from "@/lib/auth/signed-route";
import { deleteKeysSchema } from "@/validators";
import { deleteKeysFromStock } from "@/lib/backend/mutations-stocks";

export const DELETE = signedRoute({
  schema: deleteKeysSchema,
  signer: "session",
  handler: async ({ payload, pubkey: sellerPubkey }) => {
    const { keyIds } = payload;

    const result = await deleteKeysFromStock({ sellerPubkey, keyIds });

    if (result.deleted === 0) {
      return Response.json({ error: "Some keys are no longer available" }, { status: 409 });
    }

    return Response.json({ deleted: result.deleted, notFound: result.notFound });
  },
});
