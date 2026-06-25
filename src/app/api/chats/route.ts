import { NextRequest, NextResponse } from "next/server";
import { requireSessionRoute } from "@/lib/auth/session";
import { queryChats } from "@/lib/backend/query-chats";

export async function GET(req: NextRequest) {
  const auth = await requireSessionRoute();
  if (!auth.ok) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  if (auth.session.user.isAdmin !== true) {
    return NextResponse.json({ error: "Access denied" }, { status: 403 });
  }

  const sp = req.nextUrl.searchParams;
  const page = Math.max(1, parseInt(sp.get("page") ?? "1", 10) || 1);
  const pageSize = Math.min(100, Math.max(1, parseInt(sp.get("pageSize") ?? "20", 10) || 20));
  const search = sp.get("search")?.trim() || undefined;
  const sort = sp.get("sort") ?? undefined;
  const dir = sp.get("dir") ?? undefined;

  try {
    const result = await queryChats({ search, sort, dir, page, pageSize });
    return NextResponse.json(result);
  } catch (err) {
    console.error("[GET /api/chats]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
