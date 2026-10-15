import { NextRequest, NextResponse } from "next/server";
import { requireSessionRoute } from "@/lib/auth/session";
import { db } from "@/db";
import { getAdminPubkey } from "@/lib/backend/admin-key";
import { mayAdminReadOrder } from "@/lib/backend/dispute-access";
import { toChatMessage } from "@/lib/backend/query-chat";
import { SIGNED_ACTION_SELECT } from "@/lib/backend/signed-action-record";
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
      // Creation order (ids are monotonic): the per-chat hash chain is verified in this order.
      messages: {
        orderBy: { id: "asc" },
        include: {
          keys: { where: { recipientPubkey: adminPubkey ?? "" } },
          signedAction: { select: SIGNED_ACTION_SELECT },
        },
      },
    },
  });

  if (!chat) {
    return NextResponse.json({ error: "Chat not found" }, { status: 404 });
  }

  // The admin may inspect a chat while its order is under dispute, or afterwards if it adjudicated
  // that dispute (so it can review a case it resolved). Happy-path orders are never readable.
  if (!mayAdminReadOrder(chat.order)) {
    return NextResponse.json({ error: "Access allowed only during a dispute" }, { status: 403 });
  }

  // The admin's own `MessageKey` is populated only after a dispute opener re-wrapped the CEKs toward
  // the admin (or the message was already wrapped toward it).
  const messages: ChatMessage[] = chat.messages.map((m) =>
    toChatMessage(m, chatId, adminPubkey ?? "")
  );

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
