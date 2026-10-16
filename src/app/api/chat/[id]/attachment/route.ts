import { NextResponse } from "next/server";
import { db } from "@/db";
import { IMAGE_MIME_ALLOWLIST, MAX_ATTACHMENT_BYTES } from "@/validators";
import { putChatObject } from "@/lib/storage/s3";
import { isDisputeStatus } from "@/lib/backend/dispute-access";
import { signedRoute } from "@/lib/auth/signed-route";

const MAX_NAME_LENGTH = 255;

// Signed raw-bytes upload: the image is the request body (`Content-Type` = image MIME), its file name
// travels in the `name` query param. Both are covered by the signature (`bodySha256` + signed path).
export const POST = signedRoute({
  body: "raw",
  signer: "session",
  maxBytes: MAX_ATTACHMENT_BYTES,
  maxBytesMessage: "The file exceeds the maximum size of 5 MB.",
  handler: async ({ req, params, session, pubkey, bytes, contentType }) => {
    const chatId = parseInt(params.id, 10);
    if (isNaN(chatId)) {
      return NextResponse.json({ error: "Chat not found" }, { status: 404 });
    }

    const isAdmin = session.user.isAdmin === true;

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

    const name = req.nextUrl.searchParams.get("name")?.trim();
    if (!name || name.length > MAX_NAME_LENGTH) {
      return NextResponse.json({ error: "Query param 'name' missing or invalid" }, { status: 400 });
    }

    if (!(IMAGE_MIME_ALLOWLIST as readonly string[]).includes(contentType)) {
      return NextResponse.json(
        {
          error: "Unsupported file type. Only images are allowed (JPEG, PNG, WebP, GIF).",
        },
        { status: 400 }
      );
    }

    if (bytes.length === 0) {
      return NextResponse.json({ error: "Empty file" }, { status: 400 });
    }

    // Derive extension from MIME type
    const extMap: Record<string, string> = {
      "image/jpeg": "jpg",
      "image/png": "png",
      "image/webp": "webp",
      "image/gif": "gif",
    };
    const ext = extMap[contentType] ?? "bin";

    const key = await putChatObject({ chatId, body: Buffer.from(bytes), contentType, ext });

    return NextResponse.json(
      {
        key,
        name,
        contentType,
        size: bytes.length,
      },
      { status: 201 }
    );
  },
});
