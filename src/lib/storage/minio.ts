import "server-only";

import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
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

export function getS3Client(): S3Client {
  const endpoint = getEnv("MINIO_ENDPOINT");
  const port = getEnv("MINIO_PORT");
  const accessKeyId = getEnv("MINIO_ACCESS_KEY");
  const secretAccessKey = getEnv("MINIO_SECRET_KEY");
  const region = getEnv("MINIO_REGION");
  const useSsl = process.env.MINIO_USE_SSL === "true";

  return new S3Client({
    endpoint: `${useSsl ? "https" : "http"}://${endpoint}:${port}`,
    region,
    credentials: { accessKeyId, secretAccessKey },
    forcePathStyle: true,
  });
}

export function getBucket(): string {
  return getEnv("MINIO_BUCKET");
}

/**
 * Store a chat attachment. The bytes are encrypted at rest (AES-256-GCM) before they reach MinIO,
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
  const bucket = getEnv("MINIO_BUCKET");
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
  const bucket = getEnv("MINIO_BUCKET");
  const client = getS3Client();

  const res = await client.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
  if (!res.Body) {
    throw new Error(`Oggetto allegato non trovato: ${key}`);
  }
  const bytes = await res.Body.transformToByteArray();
  return decryptBytes(Buffer.from(bytes));
}
