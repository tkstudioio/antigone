import { signedRoute } from "@/lib/auth/signed-route";
import { grantAdminChatAccessSchema } from "@/validators";
import { grantAdminAccess } from "@/lib/backend/query-chat";
import { getAdminPubkey } from "@/lib/backend/admin-key";

export const POST = signedRoute({
  schema: grantAdminChatAccessSchema,
  signer: "session",
  handler: async ({ payload, pubkey, params }) => {
    const chatId = parseInt(params.id, 10);
    if (isNaN(chatId)) return Response.json({ error: "Chat not found" }, { status: 404 });

    if (payload.chatId !== chatId) {
      return Response.json({ error: "chatId does not match the URL" }, { status: 400 });
    }

    // The admin pubkey is resolved server-side, so the client cannot target an arbitrary recipient.
    const adminPubkey = getAdminPubkey();
    if (!adminPubkey) return Response.json({ error: "Admin disabled" }, { status: 409 });

    const result = await grantAdminAccess({ chatId, pubkey, adminPubkey, keys: payload.keys });
    if ("error" in result) return Response.json({ error: result.error }, { status: result.status });
    return Response.json({ ok: true });
  },
});
