import { NextRequest, NextResponse } from "next/server";
import { requireSessionRoute } from "@/lib/auth/session";
import { db } from "@/db";
import { getAdminPubkey } from "@/lib/backend/admin-key";
import { mayAdminReadOrder } from "@/lib/backend/dispute-access";
import type { ChatDetail, ChatMessage } from "@/lib/backend/query-chat-types";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
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

  const chat = await db.chat.findUnique({
    where: { id: chatId },
    include: {
      order: true,
      messages: {
        orderBy: { sentAt: "asc" },
        include: { keys: { where: { recipientPubkey: adminPubkey ?? "" } } },
      },
    },
  });

  if (!chat) {
    return NextResponse.json({ error: "Chat not found" }, { status: 404 });
  }

  // The admin may inspect a chat while its order is under dispute, or afterwards if it adjudicated
  // that dispute (so it can review a case it resolved). Happy-path orders are never readable.
  if (!mayAdminReadOrder(chat.order)) {
    return NextResponse.json(
      { error: "Access allowed only during a dispute" },
      { status: 403 }
    );
  }

  const messages: ChatMessage[] = chat.messages.map((m) => {
    // Populated only after a dispute opener re-wrapped the CEKs toward the admin.
    const adminKey = m.keys[0] ?? null;
    return {
      id: m.id,
      senderPubkey: m.senderPubkey,
      message: m.message,
      isSystem: m.isSystem ?? false,
      sentAt: m.sentAt.toISOString(),
      attachment:
        m.attachmentKey != null
          ? {
              name: m.attachmentName ?? "",
              contentType: m.attachmentType ?? "",
              size: m.attachmentSize ?? 0,
              url: `/api/chat/${chatId}/attachment/${m.id}`,
            }
          : null,
      wrappedCek: adminKey?.wrappedCek ?? null,
      wrapperPubkey: adminKey?.wrapperPubkey ?? null,
    };
  });

  const result: ChatDetail = {
    id: chat.id,
    status: chat.status,
    orderId: chat.orderId,
    buyerPubkey: chat.order.buyerPubkey,
    sellerPubkey: chat.order.sellerPubkey,
    createdAt: chat.createdAt.toISOString(),
    messages,
  };

  return NextResponse.json(result);
}
