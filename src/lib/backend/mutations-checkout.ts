import "server-only";

import { randomBytes } from "crypto";
import { db } from "@/db";
import { deriveEscrowAddress } from "@/lib/ark/escrow";
import { calculatePlatformFee } from "@/lib/fees";
import { MAX_PENDING_ORDERS_PER_ACCOUNT } from "@/lib/backend/limits";

/** Escrow descriptor returned to the client so it can re-derive and verify the address. */
type EscrowDescriptor = {
  address: string;
  sellerPubkey: string;
  arbiterPubkey: string;
  serverPubkey: string;
  exitDelay: number;
  price: number;
  platformFee: number;
  /** Per-order commitment nonce (64-char hex, 32 bytes) used to derive a unique escrow address. */
  nonce: string;
};

type OrderResult = {
  id: number;
  sellerPubkey: string;
  sellerUsername: string;
  totalSats: number;
  platformFee: number;
  status: string;
  keyIds: number[];
  escrow: EscrowDescriptor;
};

type CheckoutResult = {
  orders: OrderResult[];
};

/** Escrow inputs resolved by the route (operator config, admin key, timelock, checkout signature). */
type EscrowOptions = {
  /** Arkade operator pubkey, 33-byte compressed hex. */
  serverPubkey: string;
  /** Bech32 hrp matching the operator network. */
  hrp: string;
  /** Platform admin / arbiter pubkey, 33-byte compressed hex (must exist as an Account). */
  adminPubkey: string;
  /** Operator's CSV exit delay (raw getInfo().unilateralExitDelay value) for the exit paths. */
  exitDelay: number;
  /** Operator's dust threshold (getInfo().dust); the platform fee is floored at `dustLimit + 1`. */
  dustLimit: number;
  /** Checkout request signature, reused as the order chat's signature. */
  signature: string;
  /** The persisted checkout `SignedAction`: the buyer-signed terms, linked to every created order. */
  actionId: number;
};

/** One line of the buyer-signed terms (what the buyer saw in the cart and agreed to pay). */
export type CheckoutItem = { keyId: number; sellerPubkey: string; price: number };

/** Why a requested key could not be checked out. */
export type UnavailableKeyReason =
  "not_found" | "already_sold" | "reserved_by_other" | "reservation_expired" | "product_archived";

export type UnavailableKey = { keyId: number; reason: UnavailableKeyReason };

/** Thrown inside the transaction when a requested key no longer matches the signed terms. */
class CheckoutTermsChangedError extends Error {}

/** Thrown inside the transaction when any requested key is not (or no longer) reserved by the buyer. */
class CheckoutKeysUnavailableError extends Error {
  constructor(readonly unavailableKeys: UnavailableKey[]) {
    super("Some keys are no longer available");
  }
}

/** Thrown inside the transaction when the buyer already holds too many open unpaid orders. */
class CheckoutPendingCapError extends Error {}

export async function processCheckout(
  buyerPubkey: string,
  items: CheckoutItem[],
  escrowOpts: EscrowOptions
): Promise<CheckoutResult | { error: string; status: number; unavailableKeys?: UnavailableKey[] }> {
  const keyIds = items.map((i) => i.keyId);
  const signedTerms = new Map(items.map((i) => [i.keyId, i]));

  try {
    return await runCheckout(buyerPubkey, keyIds, signedTerms, escrowOpts);
  } catch (err) {
    if (err instanceof CheckoutTermsChangedError) {
      return {
        error:
          "A price or seller changed since you added the items to the cart: review the cart and try again",
        status: 409,
      };
    }
    if (err instanceof CheckoutKeysUnavailableError) {
      return {
        error: "Some keys in your cart are no longer available: review the cart and try again",
        status: 409,
        unavailableKeys: err.unavailableKeys,
      };
    }
    if (err instanceof CheckoutPendingCapError) {
      return {
        error: `Too many unpaid orders: at most ${MAX_PENDING_ORDERS_PER_ACCOUNT} can be open at once. Pay or cancel some first`,
        status: 409,
      };
    }
    throw err;
  }
}

async function runCheckout(
  buyerPubkey: string,
  keyIds: number[],
  signedTerms: Map<number, CheckoutItem>,
  escrowOpts: EscrowOptions
): Promise<CheckoutResult> {
  return db.$transaction(async (tx) => {
    // Concurrency: every claim below is a conditional UPDATE that repeats the availability filter
    // and asserts its row count. In PostgreSQL READ COMMITTED an UPDATE that blocks on a row
    // re-evaluates its WHERE clause against the updated row once the lock is released, so a key
    // already claimed by a concurrent committed checkout no longer matches and `count` falls short,
    // rolling back this whole request. No FOR UPDATE or Serializable isolation is needed.
    const now = new Date();

    const keys = await tx.key.findMany({
      where: {
        id: { in: keyIds },
        orderId: null,
        reservedBy: buyerPubkey,
        reservedUntil: { gte: now },
        // A product archived after the reservation can no longer be checked out.
        product: { archivedAt: null },
      },
      include: { seller: { select: { pubkey: true, username: true } } },
    });

    // The buyer signed these exact terms: a key whose price or seller differs from what the buyer
    // saw (a seller repriced it, or the server substituted it) must not be sold under that signature.
    for (const k of keys) {
      const signed = signedTerms.get(k.id);
      if (!signed || signed.price !== k.price || signed.sellerPubkey !== k.sellerPubkey) {
        throw new CheckoutTermsChangedError();
      }
    }

    /**
     * Re-read the given keys and say, per key, why it is not checkoutable by this buyer. Keys
     * already attached to `claimedOrderId` (an order created a moment ago in this very transaction)
     * are the ones we did win, so they are left out of the report.
     */
    const classifyUnavailable = async (
      ids: number[],
      claimedOrderId?: number
    ): Promise<UnavailableKey[]> => {
      const rows = await tx.key.findMany({
        where: { id: { in: ids } },
        select: {
          id: true,
          orderId: true,
          reservedBy: true,
          reservedUntil: true,
          product: { select: { archivedAt: true } },
        },
      });
      const byId = new Map(rows.map((r) => [r.id, r]));
      const lost =
        claimedOrderId == null ? ids : ids.filter((id) => byId.get(id)?.orderId !== claimedOrderId);
      return lost.map((keyId) => {
        const row = byId.get(keyId);
        let reason: UnavailableKeyReason;
        if (!row) reason = "not_found";
        else if (row.orderId !== null) reason = "already_sold";
        else if (row.product.archivedAt !== null) reason = "product_archived";
        else if (row.reservedBy !== null && row.reservedBy !== buyerPubkey)
          reason = "reserved_by_other";
        else reason = "reservation_expired";
        return { keyId, reason };
      });
    };

    // All-or-nothing: every requested key must still be reserved by the buyer.
    if (keys.length !== keyIds.length) {
      const foundIds = new Set(keys.map((k) => k.id));
      throw new CheckoutKeysUnavailableError(
        await classifyUnavailable(keyIds.filter((id) => !foundIds.has(id)))
      );
    }

    const groupedKeys = Object.groupBy(keys, (k) => k.sellerPubkey);

    // Cap on open unpaid orders: refuse before creating anything.
    const openUnpaid = await tx.order.count({
      where: {
        buyerPubkey,
        status: "pending",
        escrow: { status: { in: ["awaitingFunds", "partiallyFunded"] } },
      },
    });
    if (openUnpaid + Object.keys(groupedKeys).length > MAX_PENDING_ORDERS_PER_ACCOUNT) {
      throw new CheckoutPendingCapError();
    }

    const createdOrders: OrderResult[] = [];

    for (const [sellerPubkey, group] of Object.entries(groupedKeys)) {
      const keys = group!;
      const totalSats = keys.reduce((acc, curr) => acc + curr.price, 0);
      const platformFee = calculatePlatformFee(totalSats, escrowOpts.dustLimit);
      const escrowPrice = totalSats + platformFee;
      const groupKeyIds = keys.map(({ id }) => id);

      const inserted = await tx.order.create({
        data: {
          buyerPubkey,
          sellerPubkey,
          arbiterPubkey: escrowOpts.adminPubkey,
          totalSats,
          platformFee,
          status: "pending",
          checkoutActionId: escrowOpts.actionId,
        },
        select: { id: true, status: true },
      });

      const claimed = await tx.key.updateMany({
        where: {
          id: { in: groupKeyIds },
          orderId: null,
          reservedBy: buyerPubkey,
          reservedUntil: { gte: now },
        },
        data: { orderId: inserted.id, reservedBy: null, reservedUntil: null },
      });
      if (claimed.count !== groupKeyIds.length) {
        // A concurrent checkout (or reservation expiry) took keys after the read. The rows are
        // re-read so the 409 names the keys that actually fell through with their real reason, then
        // the throw rolls back everything (including the order just created).
        throw new CheckoutKeysUnavailableError(await classifyUnavailable(groupKeyIds, inserted.id));
      }

      // Generate a per-order CSPRNG nonce (32 bytes = 64 hex chars) that becomes the 7th
      // (non-spendable) commitment tapleaf of the escrow script, making the taproot address
      // unique for each order even when buyer+seller+admin+server+exitDelay are all identical.
      const nonce = randomBytes(32).toString("hex");

      // Build the escrow contract address deterministically (pure, no network).
      const escrowAddress = deriveEscrowAddress({
        buyerPubkey,
        sellerPubkey,
        adminPubkey: escrowOpts.adminPubkey,
        serverPubkey: escrowOpts.serverPubkey,
        exitDelay: escrowOpts.exitDelay,
        hrp: escrowOpts.hrp,
        scriptNonce: nonce,
      });

      // Escrow.chatId is required: create the order chat first, reusing the
      // checkout signature, then persist the escrow referencing it.
      const chat = await tx.chat.create({
        data: { orderId: inserted.id, signature: escrowOpts.signature },
        select: { id: true },
      });

      await tx.escrow.create({
        data: {
          address: escrowAddress,
          nonce,
          buyerPubkey,
          sellerPubkey,
          serverPubkey: escrowOpts.serverPubkey,
          arbiterPubkey: escrowOpts.adminPubkey,
          price: escrowPrice,
          platformFee,
          exitDelay: escrowOpts.exitDelay,
          chatId: chat.id,
          status: "awaitingFunds",
        },
      });

      // Link escrow to the order. Key.escrowAddress is @unique and cannot be
      // shared across the order's keys, so the link lives on the order only;
      // keys stay guarded by orderId.
      await tx.order.update({
        where: { id: inserted.id },
        data: { escrowAddress },
      });

      createdOrders.push({
        id: inserted.id,
        sellerPubkey,
        sellerUsername: keys[0]!.seller.username!,
        totalSats,
        platformFee,
        status: inserted.status,
        keyIds: groupKeyIds,
        escrow: {
          address: escrowAddress,
          sellerPubkey,
          arbiterPubkey: escrowOpts.adminPubkey,
          serverPubkey: escrowOpts.serverPubkey,
          exitDelay: escrowOpts.exitDelay,
          price: escrowPrice,
          platformFee,
          nonce,
        },
      });
    }

    return { orders: createdOrders };
  });
}
