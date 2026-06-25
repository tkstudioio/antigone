import { NextRequest, NextResponse } from "next/server";
import { requireSessionRoute } from "@/lib/auth/session";
import { db } from "@/db";
import { IMAGE_MIME_ALLOWLIST, MAX_ATTACHMENT_BYTES } from "@/validators";
import { putChatObject } from "@/lib/storage/minio";
import { isDisputeStatus } from "@/lib/backend/dispute-access";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireSessionRoute();
  if (!auth.ok) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const chatId = parseInt(id, 10);
  if (isNaN(chatId)) {
    return NextResponse.json({ error: "Chat not found" }, { status: 404 });
  }

  const pubkey = auth.session.user.pubkey;
  const isAdmin = auth.session.user.isAdmin === true;

  const chat = await db.chat.findUnique({
    where: { id: chatId },
    include: { order: { select: { buyerPubkey: true, sellerPubkey: true, status: true } } },
  });

  if (!chat) {
    return NextResponse.json({ error: "Chat not found" }, { status: 404 });
  }

  // Admin may upload (e.g. evidence/instructions) only during an active dispute, mirroring the
  // read-side gate; buyer and seller are always parties.
  const { buyerPubkey, sellerPubkey, status } = chat.order;
  const isParty = pubkey === buyerPubkey || pubkey === sellerPubkey;
  const adminMayAccess = isAdmin && isDisputeStatus(status);
  if (!isParty && !adminMayAccess) {
    return NextResponse.json({ error: "Unauthorized access" }, { status: 403 });
  }

  if (chat.status === "closed") {
    return NextResponse.json(
      { error: "Chat closed: cannot upload attachments" },
      { status: 409 }
    );
  }

  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const file = formData.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Field 'file' missing or invalid" }, { status: 400 });
  }

  const contentType = file.type;
  if (!(IMAGE_MIME_ALLOWLIST as readonly string[]).includes(contentType)) {
    return NextResponse.json(
      {
        error: "Unsupported file type. Only images are allowed (JPEG, PNG, WebP, GIF).",
      },
      { status: 400 }
    );
  }

  if (file.size > MAX_ATTACHMENT_BYTES) {
    return NextResponse.json(
      { error: "The file exceeds the maximum size of 5 MB." },
      { status: 413 }
    );
  }

  const arrayBuffer = await file.arrayBuffer();
  const body = Buffer.from(arrayBuffer);

  // Derive extension from MIME type
  const extMap: Record<string, string> = {
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
    "image/gif": "gif",
  };
  const ext = extMap[contentType] ?? "bin";

  const key = await putChatObject({ chatId, body, contentType, ext });

  return NextResponse.json(
    {
      key,
      name: file.name,
      contentType,
      size: file.size,
    },
    { status: 201 }
  );
}
