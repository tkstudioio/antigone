import { signedRoute } from "@/lib/auth/signed-route";
import { deleteProductSchema, updateProductSchema } from "@/validators";
import { deleteProduct, updateProduct } from "@/lib/backend/mutations-products";

function idMismatch(paramId: string, bodyId: number): Response | null {
  const id = parseInt(paramId, 10);
  if (isNaN(id)) return Response.json({ error: "Invalid product ID" }, { status: 400 });
  if (id !== bodyId) return Response.json({ error: "Product ID mismatch" }, { status: 400 });
  return null;
}

export const PATCH = signedRoute({
  schema: updateProductSchema,
  signer: "admin",
  handler: async ({ payload, params }) => {
    const mismatch = idMismatch(params.id, payload.id);
    if (mismatch) return mismatch;

    const { id, ...fields } = payload;
    const result = await updateProduct(id, fields);
    if ("error" in result) {
      return Response.json({ error: result.error }, { status: result.status });
    }
    return Response.json(result);
  },
});

// Hard delete, allowed only for a product that never had keys (409 otherwise: archive it).
export const DELETE = signedRoute({
  schema: deleteProductSchema,
  signer: "admin",
  handler: async ({ payload, params }) => {
    const mismatch = idMismatch(params.id, payload.id);
    if (mismatch) return mismatch;

    const result = await deleteProduct(payload.id);
    if ("error" in result) {
      return Response.json({ error: result.error }, { status: result.status });
    }
    return Response.json(result);
  },
});
