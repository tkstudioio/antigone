import { NextResponse } from "next/server";
import { IMAGE_MIME_ALLOWLIST, MAX_ATTACHMENT_BYTES } from "@/validators";
import { putProductObject } from "@/lib/storage/s3";
import { signedRoute } from "@/lib/auth/signed-route";

const EXT_BY_MIME: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
};

// Signed raw-bytes upload of a product image (admin only). The returned bucket key is what the
// create/update product payload carries as `imageUrl`; an upload that is never saved stays orphaned.
export const POST = signedRoute({
  body: "raw",
  signer: "admin",
  maxBytes: MAX_ATTACHMENT_BYTES,
  maxBytesMessage: "The image exceeds the maximum size of 5 MB.",
  handler: async ({ bytes, contentType }) => {
    if (!(IMAGE_MIME_ALLOWLIST as readonly string[]).includes(contentType)) {
      return NextResponse.json(
        { error: "Unsupported file type. Only images are allowed (JPEG, PNG, WebP, GIF)." },
        { status: 400 }
      );
    }
    if (bytes.length === 0) {
      return NextResponse.json({ error: "Empty file" }, { status: 400 });
    }

    const key = await putProductObject({
      body: Buffer.from(bytes),
      contentType,
      ext: EXT_BY_MIME[contentType],
    });
    return NextResponse.json({ key }, { status: 201 });
  },
});
