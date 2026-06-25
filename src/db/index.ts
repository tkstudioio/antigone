import "dotenv/config";
import { readFileSync } from "node:fs";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import type { PoolConfig } from "pg";

const url = process.env.DATABASE_URL;
if (!url) {
  throw new Error(
    "DATABASE_URL is required. Set it in .env.local pointing to your PostgreSQL instance."
  );
}

// Optional TLS: point DATABASE_CA_CERT at a PEM CA file to verify the server certificate.
// Defaults to verify-full; set DATABASE_SSL_NO_VERIFY=true to skip hostname/chain checks
// (verify-ca — useful when the cert's CN/SAN doesn't include the host IP).
function resolveSsl(): PoolConfig["ssl"] {
  const caPath = process.env.DATABASE_CA_CERT;
  if (!caPath) return undefined;
  return {
    ca: readFileSync(caPath, "utf8"),
    rejectUnauthorized: process.env.DATABASE_SSL_NO_VERIFY !== "true",
  };
}

const ssl = resolveSsl();
const adapter = new PrismaPg(ssl ? { connectionString: url, ssl } : url);

const globalForDb = globalThis as unknown as {
  prismaClient?: PrismaClient;
};

const db =
  globalForDb.prismaClient ??
  new PrismaClient({
    adapter,
  });

if (process.env.NODE_ENV !== "production") globalForDb.prismaClient = db;

export { db };
