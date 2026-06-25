/**
 * One-shot, idempotent backfill: encrypt any plaintext Key.code and populate code_hash.
 * Run with: tsx src/db/migrate-encrypt-keys.ts
 * (DATABASE_URL + ENCRYPTION_KEY are loaded from .env via dotenv.)
 *
 * Idempotent: rows whose code is already in the `v1:` form are skipped. Because the
 * original plaintext is needed to compute code_hash, hashing happens here while the
 * plaintext is still readable.
 */
import "dotenv/config";
import { db } from "@/db";
import { encryptCode, hashCode, isEncrypted } from "@/lib/crypto/symmetric";

async function main() {
  const keys = await db.key.findMany({ select: { id: true, code: true } });

  let encrypted = 0;
  let skipped = 0;

  for (const k of keys) {
    if (isEncrypted(k.code)) {
      skipped++;
      continue;
    }
    await db.key.update({
      where: { id: k.id },
      data: { code: encryptCode(k.code), codeHash: hashCode(k.code) },
    });
    encrypted++;
  }

  console.log(`Backfill completato: ${encrypted} cifrate, ${skipped} già cifrate (saltate).`);
}

main()
  .then(async () => {
    await db.$disconnect();
  })
  .catch(async (err) => {
    console.error(err);
    await db.$disconnect();
    process.exit(1);
  });
