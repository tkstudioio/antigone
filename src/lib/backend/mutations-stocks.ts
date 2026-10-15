import "server-only";

import { db } from "@/db";

/** A license code already encrypted in the seller's browser (the server never sees plaintext). */
export type EncryptedStockCode = {
  ciphertext: string;
  wrappedCek: string;
  codeHash: string;
};

export async function upsertStockKeys(params: {
  sellerPubkey: string;
  productId: number;
  price: number;
  codes: EncryptedStockCode[];
}): Promise<{ inserted: number; skipped: number; isNew: boolean }> {
  const { sellerPubkey, productId, price, codes } = params;

  // Drop duplicates inside the request itself (same client-side dedup hash).
  const uniqueCodes = [...new Map(codes.map((c) => [c.codeHash, c])).values()];

  // Check whether any row exists for this tier before inserting
  const existingTierRow = await db.key.findFirst({
    where: {
      sellerPubkey,
      productId,
      price,
      orderId: null,
    },
    select: { id: true },
  });

  const isNew = existingTierRow === null;

  // Find codes that already exist for this (seller, product) regardless of price/state.
  // Compare on the client-computed code_hash because ciphertext is non-deterministic (random IV).
  const existingHashes = await db.key.findMany({
    where: { sellerPubkey, productId },
    select: { codeHash: true },
  });

  const existingHashSet = new Set(existingHashes.map((r) => r.codeHash));

  const newCodes = uniqueCodes.filter((c) => !existingHashSet.has(c.codeHash));
  const skipped = uniqueCodes.length - newCodes.length;

  if (newCodes.length > 0) {
    // One key row + the seller's own wrapped content key per code. The seller wraps the CEK
    // toward itself (wrapper = recipient = seller).
    await db.$transaction(async (tx) => {
      const created = await tx.key.createManyAndReturn({
        data: newCodes.map((c) => ({
          sellerPubkey,
          productId,
          price,
          code: c.ciphertext,
          codeHash: c.codeHash,
        })),
        select: { id: true, codeHash: true },
      });
      const wrapByHash = new Map(newCodes.map((c) => [c.codeHash, c.wrappedCek]));
      await tx.keyCodeKey.createMany({
        data: created.map((k) => ({
          keyId: k.id,
          recipientPubkey: sellerPubkey,
          wrapperPubkey: sellerPubkey,
          wrappedCek: wrapByHash.get(k.codeHash!)!,
        })),
      });
    });
  }

  return { inserted: newCodes.length, skipped, isNew };
}

export async function updateStockPrice(params: {
  sellerPubkey: string;
  productId: number;
  oldPrice: number;
  newPrice: number;
}): Promise<{ updated: number; merged: boolean }> {
  const { sellerPubkey, productId, oldPrice, newPrice } = params;
  const now = new Date();

  const existingAtNewPrice = await db.key.findFirst({
    where: {
      sellerPubkey,
      productId,
      price: newPrice,
      orderId: null,
      OR: [{ reservedUntil: null }, { reservedUntil: { lte: now } }],
    },
    select: { id: true },
  });

  const merged = existingAtNewPrice !== null;

  const result = await db.key.updateMany({
    where: {
      sellerPubkey,
      productId,
      price: oldPrice,
      orderId: null,
      OR: [{ reservedUntil: null }, { reservedUntil: { lte: now } }],
    },
    data: { price: newPrice },
  });

  return { updated: result.count, merged };
}

export async function deleteStock(params: {
  sellerPubkey: string;
  productId: number;
  price: number;
}): Promise<{ deleted: number }> {
  const { sellerPubkey, productId, price } = params;
  const now = new Date();

  const result = await db.key.deleteMany({
    where: {
      sellerPubkey,
      productId,
      price,
      orderId: null,
      OR: [{ reservedUntil: null }, { reservedUntil: { lte: now } }],
    },
  });

  return { deleted: result.count };
}

export async function deleteKeysFromStock(params: {
  sellerPubkey: string;
  keyIds: string[];
}): Promise<{ deleted: number; notFound: number }> {
  const { sellerPubkey, keyIds } = params;
  const now = new Date();

  const numericIds = keyIds.map((id) => parseInt(id, 10)).filter((id) => !isNaN(id));

  if (numericIds.length === 0) {
    return { deleted: 0, notFound: keyIds.length };
  }

  const result = await db.key.deleteMany({
    where: {
      id: { in: numericIds },
      sellerPubkey,
      orderId: null,
      OR: [{ reservedUntil: null }, { reservedUntil: { lte: now } }],
    },
  });

  const deleted = result.count;
  const notFound = keyIds.length - deleted;

  return { deleted, notFound };
}
