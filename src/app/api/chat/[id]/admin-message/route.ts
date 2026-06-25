import { NextRequest, NextResponse } from "next/server";
import { requireSessionRoute } from "@/lib/auth/session";
import { db } from "@/db";
import { adminMessageSchema } from "@/validators";
import { verifySignedJsonBody } from "@/lib/auth/verify-signed-json-body";
import { getAdminPubkey } from "@/lib/backend/admin-key";
import { isDisputeStatus } from "@/lib/backend/dispute-access";
import { createMessage } from "@/lib/backend/query-chat";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireSessionRoute();
  if (!auth.ok) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  if (auth.session.user.isAdmin !== true) {
    return NextResponse.json({ error: "Access denied" }, { status: 403 });
  }

  const { id } = await params;
  const chatId = parseInt(id, 10);
  if (isNaN(chatId)) {
    return NextResponse.json({ error: "Invalid chat ID" }, { status: 400 });
  }

  const adminPubkey = getAdminPubkey();
  if (!adminPubkey) {
    return NextResponse.json({ error: "Admin disabled" }, { status: 409 });
  }

  // The admin message is signed by the admin key (non-repudiation, parity with buyer/seller
  // messages). Verifying against the server-derived admin pubkey also re-confirms the sender.
  let parsed: Awaited<ReturnType<typeof verifySignedJsonBody<typeof adminMessageSchema>>>;
  try {
    parsed = await verifySignedJsonBody(req, adminPubkey, adminMessageSchema);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Invalid signature";
    const status = message.includes("Invalid signature") ? 401 : 422;
    return NextResponse.json({ error: message }, { status });
  }

  const { ciphertext, keys, attachment } = parsed;

  const pubkey = auth.session.user.pubkey;

  const chat = await db.chat.findUnique({
    where: { id: chatId },
    include: { order: { select: { buyerPubkey: true, sellerPubkey: true, status: true } } },
  });
  if (!chat) {
    return NextResponse.json({ error: "Chat not found" }, { status: 404 });
  }

  // The admin may only participate in a chat that is under dispute resolution.
  if (!isDisputeStatus(chat.order.status)) {
    return NextResponse.json(
      { error: "Access allowed only during a dispute" },
      { status: 403 }
    );
  }

  if (chat.status === "closed") {
    return NextResponse.json(
      { error: "Chat closed: cannot send messages" },
      { status: 409 }
    );
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

  const msg = await createMessage({
    chatId,
    senderPubkey: pubkey,
    ciphertext,
    keys,
    signature: parsed.signature,
    attachment,
  });

  const myKey = msg.keys.find((k) => k.recipientPubkey === pubkey) ?? null;
  return NextResponse.json(
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
