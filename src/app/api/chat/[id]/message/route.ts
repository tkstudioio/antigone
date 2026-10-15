import { signedRoute } from "@/lib/auth/signed-route";
import { postChatMessageSchema } from "@/validators";
import { createMessage, toChatMessage } from "@/lib/backend/query-chat";
import { db } from "@/db";

export const POST = signedRoute({
  schema: postChatMessageSchema,
  signer: "session",
  handler: async ({ payload, pubkey, params, action }) => {
    const chatId = parseInt(params.id, 10);
    if (isNaN(chatId)) {
      return Response.json({ error: "Chat not found" }, { status: 404 });
    }

    if (payload.chatId !== chatId) {
      return Response.json({ error: "chatId does not match the URL" }, { status: 400 });
    }

    const chat = await db.chat.findUnique({
      where: { id: chatId },
      include: { order: { select: { buyerPubkey: true, sellerPubkey: true } } },
    });

    if (!chat) {
      return Response.json({ error: "Chat not found" }, { status: 404 });
    }

    const { buyerPubkey, sellerPubkey } = chat.order;
    if (pubkey !== buyerPubkey && pubkey !== sellerPubkey) {
      return Response.json({ error: "Unauthorized access" }, { status: 403 });
    }

    if (chat.status === "closed") {
      return Response.json({ error: "Chat closed: cannot send messages" }, { status: 409 });
    }

    // For text messages, require that the envelope is addressed to both parties so the
    // counterparty can decrypt. (Attachment-only messages have no envelope until attachments
    // are encrypted in a follow-up plan.)
    if (payload.ciphertext != null) {
      const recipients = new Set((payload.keys ?? []).map((k) => k.recipientPubkey));
      if (!recipients.has(buyerPubkey) || !recipients.has(sellerPubkey)) {
        return Response.json(
          { error: "The envelope must include both buyer and seller" },
          { status: 422 }
        );
      }
    }

    // Links the message to its signed action and enforces the per-chat hash chain (409 when the
    // signed `prevHash` is not the current tail).
    const created = await createMessage({
      chatId,
      senderPubkey: pubkey,
      ciphertext: payload.ciphertext,
      keys: payload.keys,
      signature: action.signature,
      actionId: action.id,
      prevHash: payload.prevHash,
      attachment: payload.attachment,
    });
    if ("error" in created) {
      return Response.json({ error: created.error }, { status: created.status });
    }

    return Response.json(toChatMessage(created.message, chatId, pubkey), { status: 201 });
  },
});
