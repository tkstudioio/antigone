import "server-only";

import { S3Client, PutObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";
import { GetObjectCommand } from "@aws-sdk/client-s3";
import { randomUUID } from "crypto";
import { decryptBytes, encryptBytes } from "@/lib/crypto/symmetric";

export function getEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `Required environment variable not found: ${name}. Configure ${name} for attachment storage to work.`
    );
  }
  return value;
}

/** Any S3-compatible store: MinIO in local dev, Cloudflare R2 on Vercel. */
export function getS3Client(): S3Client {
  return new S3Client({
    endpoint: getEnv("S3_ENDPOINT"),
    region: getEnv("S3_REGION"),
    credentials: {
      accessKeyId: getEnv("S3_ACCESS_KEY_ID"),
      secretAccessKey: getEnv("S3_SECRET_ACCESS_KEY"),
    },
    forcePathStyle: true,
  });
}

export function getBucket(): string {
  return getEnv("S3_BUCKET");
}

/**
 * Store a chat attachment. The bytes are encrypted at rest (AES-256-GCM) before they reach the store,
 * so neither the object store nor anyone with raw bucket access can read them. The stored object's
 * Content-Type is generic (`application/octet-stream`) since the payload is ciphertext; the real
 * MIME type lives in the DB and is applied when streaming back through {@link getChatObject}.
 */
export async function putChatObject(params: {
  chatId: number;
  body: Buffer;
  contentType: string;
  ext: string;
}): Promise<string> {
  const { chatId, body, ext } = params;
  const bucket = getBucket();
  const key = `chat/${chatId}/${randomUUID()}.${ext}`;

  const client = getS3Client();
  await client.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: encryptBytes(body),
      ContentType: "application/octet-stream",
    })
  );

  return key;
}

/**
 * Fetch a chat attachment and decrypt it server-side. Returns the plaintext bytes to be streamed
 * to an authorized party. (We can no longer hand out a presigned URL because the stored object is
 * ciphertext — the download must be proxied through the app so the bytes are decrypted in transit.)
 * Legacy plaintext objects (pre-encryption) are returned unchanged by `decryptBytes`.
 */
export async function getChatObject(key: string): Promise<Buffer> {
  const bucket = getBucket();
  const client = getS3Client();

  const res = await client.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
  if (!res.Body) {
    throw new Error(`Attachment object not found: ${key}`);
  }
  const bytes = await res.Body.transformToByteArray();
  return decryptBytes(Buffer.from(bytes));
}

/**
 * Store a product image. Product images are public catalog content, so they are stored in clear
 * with their real Content-Type and served as-is by the public proxy `GET /api/images/[...key]`.
 * Returns the bucket key, which is what `Product.imageUrl` holds.
 */
export async function putProductObject(params: {
  body: Buffer;
  contentType: string;
  ext: string;
}): Promise<string> {
  const { body, contentType, ext } = params;
  const key = `products/${randomUUID()}.${ext}`;

  await getS3Client().send(
    new PutObjectCommand({ Bucket: getBucket(), Key: key, Body: body, ContentType: contentType })
  );

  return key;
}

/**
 * Best-effort removal of a product image that is no longer referenced (replaced or product
 * deleted). A failure only leaves an orphan object behind, so it is logged and swallowed.
 */
export async function deleteProductObject(key: string): Promise<void> {
  try {
    await getS3Client().send(new DeleteObjectCommand({ Bucket: getBucket(), Key: key }));
  } catch (err) {
    console.error(`Could not delete product image ${key}`, err);
  }
}
