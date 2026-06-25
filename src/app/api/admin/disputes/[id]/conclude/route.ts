import { requireAdminRoute } from "@/lib/auth/session";
import { verifySignedJsonBody } from "@/lib/auth/verify-signed-json-body";
import { concludeOrderAsAdmin } from "@/lib/backend/mutations-orders";
import { mnemonicToPrivateKey, derivePubkey } from "@/lib/utils";
import { concludeDisputeSchema } from "@/validators";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdminRoute();
  if (!auth.ok) return auth.response;

  const { id } = await params;
  const orderId = parseInt(id, 10);
  if (isNaN(orderId)) {
    return Response.json({ error: "Invalid dispute ID" }, { status: 400 });
  }

  // Derive admin pubkey at request time (same logic as auth-options.ts)
  const adminMnemonic = process.env.ADMIN_MNEMONIC;
  if (!adminMnemonic) {
    return Response.json({ error: "Admin disabled" }, { status: 403 });
  }

  let adminPubkey: string;
  try {
    adminPubkey = derivePubkey(mnemonicToPrivateKey(adminMnemonic, process.env.ADMIN_PASSPHRASE));
  } catch {
    return Response.json({ error: "Admin disabled" }, { status: 403 });
  }

  let parsed: Awaited<ReturnType<typeof verifySignedJsonBody<typeof concludeDisputeSchema>>>;
  try {
    parsed = await verifySignedJsonBody(req, adminPubkey, concludeDisputeSchema);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg === "Invalid signature") {
      return Response.json({ error: "Invalid signature" }, { status: 401 });
    }
    return Response.json({ error: msg }, { status: 422 });
  }

  if (parsed.orderId !== orderId) {
    return Response.json({ error: "Order ID mismatch" }, { status: 400 });
  }

  const result = await concludeOrderAsAdmin({
    orderId: parsed.orderId,
    refundAmount: parsed.refundAmount,
    conclusionStatus: parsed.conclusionStatus,
    favouredRole: parsed.favouredRole,
    refundedKeyIds: parsed.refundedKeyIds,
    refundSignature: parsed.signature,
  });

  if ("error" in result) {
    return Response.json({ error: result.error }, { status: result.status });
  }

  return Response.json({ ok: true });
}
