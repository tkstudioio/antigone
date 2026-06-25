import { NextRequest, NextResponse } from "next/server";
import { GetObjectCommand } from "@aws-sdk/client-s3";
import { getS3Client, getBucket } from "@/lib/storage/minio";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ key: string[] }> }) {
  const { key } = await params;
  const objectKey = key.join("/");

  // Deny access to chat attachment objects (prefix "chat/"). Those are encrypted at rest and must
  // be served exclusively via the authenticated + gated route GET /api/chat/[id]/attachment/[messageId].
  if (key[0] === "chat") {
    return new NextResponse(null, { status: 404 });
  }

  const client = getS3Client();
  const bucket = getBucket();

  try {
    const response = await client.send(new GetObjectCommand({ Bucket: bucket, Key: objectKey }));

    const body = response.Body;
    if (!body) {
      return new NextResponse(null, { status: 404 });
    }

    const stream = body.transformToWebStream();
    return new NextResponse(stream, {
      headers: {
        "Content-Type": response.ContentType ?? "application/octet-stream",
        "Cache-Control": "public, max-age=31536000, immutable",
      },
    });
  } catch (err: unknown) {
    if (err instanceof Error && err.name === "NoSuchKey") {
      return new NextResponse(null, { status: 404 });
    }
    return new NextResponse(null, { status: 500 });
  }
}
