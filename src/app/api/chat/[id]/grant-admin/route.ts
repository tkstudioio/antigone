import { NextRequest, NextResponse } from "next/server";
import { requireSessionRoute } from "@/lib/auth/session";
import { verifySignedJsonBody } from "@/lib/auth/verify-signed-json-body";
import { grantAdminChatAccessSchema } from "@/validators";
import { grantAdminAccess } from "@/lib/backend/query-chat";
import { getAdminPubkey } from "@/lib/backend/admin-key";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireSessionRoute();
  if (!auth.ok) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const chatId = parseInt(id, 10);
  if (isNaN(chatId)) return Response.json({ error: "Chat not found" }, { status: 404 });

  const pubkey = auth.session.user.pubkey;

  let parsed: Awaited<ReturnType<typeof verifySignedJsonBody<typeof grantAdminChatAccessSchema>>>;
  try {
    parsed = await verifySignedJsonBody(req, pubkey, grantAdminChatAccessSchema);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Invalid signature";
    const status = message.includes("Invalid signature") ? 401 : 422;
    return Response.json({ error: message }, { status });
  }
  if (parsed.chatId !== chatId) {
    return Response.json({ error: "chatId does not match the URL" }, { status: 400 });
  }

  // The admin pubkey is resolved server-side, so the client cannot target an arbitrary recipient.
  const adminPubkey = getAdminPubkey();
  if (!adminPubkey) return Response.json({ error: "Admin disabled" }, { status: 409 });

  const result = await grantAdminAccess({ chatId, pubkey, adminPubkey, keys: parsed.keys });
  if ("error" in result) return Response.json({ error: result.error }, { status: result.status });
  return Response.json({ ok: true });
}
