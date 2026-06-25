import { NextRequest, NextResponse } from "next/server";
import { requireSessionRoute } from "@/lib/auth/session";
import { queryChatDetail } from "@/lib/backend/query-chat";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireSessionRoute();
  if (!auth.ok) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const chatId = parseInt(id, 10);
  if (isNaN(chatId)) {
    return Response.json({ error: "Chat not found" }, { status: 404 });
  }

  const pubkey = auth.session.user.pubkey;
  const chat = await queryChatDetail({ pubkey, chatId });

  if (!chat) {
    return Response.json({ error: "Chat not found" }, { status: 404 });
  }

  return Response.json(chat);
}
