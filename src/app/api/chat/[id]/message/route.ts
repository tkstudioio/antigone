import { NextRequest, NextResponse } from "next/server";
import { requireSessionRoute } from "@/lib/auth/session";
import { verifySignedJsonBody } from "@/lib/auth/verify-signed-json-body";
import { postChatMessageSchema } from "@/validators";
import { createMessage } from "@/lib/backend/query-chat";
import { db } from "@/db";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireSessionRoute();
  if (!auth.ok) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const chatId = parseInt(id, 10);
  if (isNaN(chatId)) {
    return Response.json({ error: "Chat not found" }, { status: 404 });
  }

  const pubkey = auth.session.user.pubkey;

  let parsed: Awaited<ReturnType<typeof verifySignedJsonBody<typeof postChatMessageSchema>>>;
  try {
    parsed = await verifySignedJsonBody(req, pubkey, postChatMessageSchema);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Invalid signature";
    const status = message.includes("Invalid signature") ? 401 : 422;
    return Response.json({ error: message }, { status });
  }

  if (parsed.chatId !== chatId) {
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
  if (parsed.ciphertext != null) {
    const recipients = new Set((parsed.keys ?? []).map((k) => k.recipientPubkey));
    if (!recipients.has(buyerPubkey) || !recipients.has(sellerPubkey)) {
      return Response.json(
        { error: "The envelope must include both buyer and seller" },
        { status: 422 }
      );
    }
  }

  const msg = await createMessage({
    chatId,
    senderPubkey: pubkey,
    ciphertext: parsed.ciphertext,
    keys: parsed.keys,
    signature: parsed.signature,
    attachment: parsed.attachment,
  });

  const myKey = msg.keys.find((k) => k.recipientPubkey === pubkey) ?? null;
  return Response.json(
    {
      id: msg.id,
      senderPubkey: msg.senderPubkey,
      message: msg.message,
      isSystem: msg.isSystem ?? false,
      sentAt: msg.sentAt.toISOString(),
      attachment:
        msg.attachmentKey != null
          ? {
              name: msg.attachmentName ?? "",
              contentType: msg.attachmentType ?? "",
              size: msg.attachmentSize ?? 0,
              url: `/api/chat/${chatId}/attachment/${msg.id}`,
            }
          : null,
      wrappedCek: myKey?.wrappedCek ?? null,
      wrapperPubkey: myKey?.wrapperPubkey ?? null,
    },
    { status: 201 }
  );
}
