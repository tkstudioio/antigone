import "server-only";

import { db } from "@/db";
import { encryptCode, hashCode } from "@/lib/crypto/symmetric";

export async function upsertStockKeys(params: {
  sellerPubkey: string;
  productId: number;
  price: number;
  codes: string[];
}): Promise<{ inserted: number; skipped: number; isNew: boolean }> {
  const { sellerPubkey, productId, price, codes } = params;

  const uniqueCodes = [...new Set(codes)];

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
  // Compare on code_hash because ciphertext is non-deterministic (random IV).
  const existingHashes = await db.key.findMany({
    where: { sellerPubkey, productId },
    select: { codeHash: true },
  });

  const existingHashSet = new Set(existingHashes.map((r) => r.codeHash));

  const newCodes = uniqueCodes.filter((c) => !existingHashSet.has(hashCode(c)));
  const skipped = uniqueCodes.length - newCodes.length;

  if (newCodes.length > 0) {
    await db.key.createMany({
      data: newCodes.map((code) => ({
        sellerPubkey,
        productId,
        price,
        code: encryptCode(code),
        codeHash: hashCode(code),
      })),
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
