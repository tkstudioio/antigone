import { NextResponse } from "next/server";
import { db } from "@/db";
import { adminMessageSchema } from "@/validators";
import { signedRoute } from "@/lib/auth/signed-route";
import { isDisputeStatus } from "@/lib/backend/dispute-access";
import { createMessage, toChatMessage } from "@/lib/backend/query-chat";

// The admin message is signed by the admin key (non-repudiation, parity with buyer/seller
// messages). The `admin` signer gates on `session.user.isAdmin` and verifies against the admin
// session's pubkey.
export const POST = signedRoute({
  schema: adminMessageSchema,
  signer: "admin",
  handler: async ({ payload, pubkey, params, action }) => {
    const chatId = parseInt(params.id, 10);
    if (isNaN(chatId)) {
      return NextResponse.json({ error: "Invalid chat ID" }, { status: 400 });
    }

    const { ciphertext, keys, attachment } = payload;

    const chat = await db.chat.findUnique({
      where: { id: chatId },
      include: { order: { select: { buyerPubkey: true, sellerPubkey: true, status: true } } },
    });
    if (!chat) {
      return NextResponse.json({ error: "Chat not found" }, { status: 404 });
    }

    // The admin may only participate in a chat that is under dispute resolution.
    if (!isDisputeStatus(chat.order.status)) {
      return NextResponse.json({ error: "Access allowed only during a dispute" }, { status: 403 });
    }

    if (chat.status === "closed") {
      return NextResponse.json({ error: "Chat closed: cannot send messages" }, { status: 409 });
    }

    // The admin's E2E message must reach both parties (it may also wrap toward the admin so the
    // admin can re-read its own message).
    if (ciphertext != null) {
      const recipients = new Set((keys ?? []).map((k) => k.recipientPubkey));
      const { buyerPubkey, sellerPubkey } = chat.order;
      if (!recipients.has(buyerPubkey) || !recipients.has(sellerPubkey)) {
        return NextResponse.json(
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
      ciphertext,
      keys,
      signature: action.signature,
      actionId: action.id,
      prevHash: payload.prevHash,
      attachment,
    });
    if ("error" in created) {
      return NextResponse.json({ error: created.error }, { status: created.status });
    }

    return NextResponse.json(toChatMessage(created.message, chatId, pubkey), { status: 201 });
  },
});
