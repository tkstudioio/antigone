import "server-only";

import { randomBytes } from "crypto";
import { db } from "@/db";
import { deriveEscrowAddress } from "@/lib/ark/escrow";
import { calculatePlatformFee } from "@/lib/fees";

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
};

export async function processCheckout(
  buyerPubkey: string,
  keyIds: number[],
  escrowOpts: EscrowOptions
): Promise<CheckoutResult> {
  return db.$transaction(async (tx) => {
    // TODO: consider pg_advisory_xact_lock for cross-buyer races if lock semantics become critical.
    // Prisma does not expose SELECT...FOR UPDATE. The updateMany inside this transaction provides
    // best-effort serialization; the orderId !== null guard below catches most race windows.

    const keys = await tx.key.findMany({
      where: {
        id: { in: keyIds },
        orderId: null,
        reservedBy: buyerPubkey,
        reservedUntil: { gte: new Date() },
      },
      include: { seller: { select: { pubkey: true, username: true } } },
    });

    const groupedKeys = Object.groupBy(keys, (k) => k.sellerPubkey);

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
        },
        select: { id: true, status: true },
      });

      await tx.key.updateMany({
        where: { id: { in: groupKeyIds } },
        data: { orderId: inserted.id, reservedBy: null, reservedUntil: null },
      });

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
