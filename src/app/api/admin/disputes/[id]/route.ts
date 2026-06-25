import { requireAdminRoute } from "@/lib/auth/session";
import { queryOrderDetailAsAdmin } from "@/lib/backend/query-orders";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdminRoute();
  if (!auth.ok) return auth.response;

  const { id } = await params;
  const orderId = parseInt(id, 10);
  if (isNaN(orderId)) {
    return Response.json({ error: "Invalid dispute ID" }, { status: 400 });
  }

  const detail = await queryOrderDetailAsAdmin({ orderId });

  if (!detail) {
    return Response.json({ error: "Dispute not found" }, { status: 404 });
  }

  return Response.json(detail);
}
