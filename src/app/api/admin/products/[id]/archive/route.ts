import { signedRoute } from "@/lib/auth/signed-route";
import { archiveProductSchema } from "@/validators";
import { setProductArchived } from "@/lib/backend/mutations-products";

// `{ archived: true }` archives the product (off the storefront, no new stock/reservations/checkouts),
// `{ archived: false }` lists it again.
export const POST = signedRoute({
  schema: archiveProductSchema,
  signer: "admin",
  handler: async ({ payload, params }) => {
    const id = parseInt(params.id, 10);
    if (isNaN(id)) return Response.json({ error: "Invalid product ID" }, { status: 400 });
    if (id !== payload.id) return Response.json({ error: "Product ID mismatch" }, { status: 400 });

    const result = await setProductArchived(payload.id, payload.archived);
    if ("error" in result) {
      return Response.json({ error: result.error }, { status: result.status });
    }
    return Response.json(result);
  },
});
