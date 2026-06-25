import { NextRequest, NextResponse } from "next/server";
import { requireSessionRoute } from "@/lib/auth/session";
import { db } from "@/db";
import { getChatObject } from "@/lib/storage/minio";
import { mayAdminReadOrder } from "@/lib/backend/dispute-access";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; messageId: string }> }
) {
  const auth = await requireSessionRoute();
  if (!auth.ok) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id, messageId } = await params;
  const chatId = parseInt(id, 10);
  const msgId = parseInt(messageId, 10);

  if (isNaN(chatId) || isNaN(msgId)) {
    return NextResponse.json({ error: "Invalid parameters" }, { status: 404 });
  }

  const pubkey = auth.session.user.pubkey;
  const isAdmin = auth.session.user.isAdmin === true;

  const chat = await db.chat.findUnique({
    where: { id: chatId },
    include: {
      order: {
        select: {
          buyerPubkey: true,
          sellerPubkey: true,
          status: true,
          conclusionStatus: true,
        },
      },
    },
  });

  if (!chat) {
    return NextResponse.json({ error: "Chat not found" }, { status: 404 });
  }

  // Buyer and seller are always parties. The admin may read media while the order is under dispute
  // or afterwards if it adjudicated that dispute (review of a resolved case).
  const { buyerPubkey, sellerPubkey } = chat.order;
  const isParty = pubkey === buyerPubkey || pubkey === sellerPubkey;
  const adminMayAccess = isAdmin && mayAdminReadOrder(chat.order);
  if (!isParty && !adminMayAccess) {
    return NextResponse.json({ error: "Unauthorized access" }, { status: 403 });
  }

  const message = await db.message.findUnique({ where: { id: msgId } });

  if (!message || message.chatId !== chatId) {
    return NextResponse.json({ error: "Attachment not found" }, { status: 404 });
  }

  if (!message.attachmentKey) {
    return NextResponse.json({ error: "This message has no attachments" }, { status: 404 });
  }

  const plaintext = await getChatObject(message.attachmentKey);
  return new NextResponse(new Uint8Array(plaintext), {
    status: 200,
    headers: {
      "Content-Type": message.attachmentType ?? "application/octet-stream",
      "Content-Length": String(plaintext.length),
      "Cache-Control": "private, no-store",
    },
  });
}
