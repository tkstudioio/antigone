"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSession } from "next-auth/react";
import { backend } from "@/lib/backend";
import { postSigned, requestSigned } from "@/lib/auth/signed-request";
import useProfileStore from "@/stores/profile";
import { deriveEscrowAddress } from "@/lib/ark/escrow";
import { getOperatorSignerPubkey } from "@/lib/ark/operator-signer";
import { checkArbiter } from "@/lib/arbiter-pin";
import { samePubkey } from "@/lib/auth/verify-signed-action";

// ─── Types ───────────────────────────────────────────────────────────────────

export type CartTier = {
  sellerPubkey: string;
  sellerUsername: string;
  price: number;
  quantity: number;
  keyIds: number[];
};

export type CartProduct = {
  productId: number;
  productName: string;
  totalQuantity: number;
  totalSubtotal: number;
  expiresAt: string;
  tiers: CartTier[];
};

export type CartResponse = {
  products: CartProduct[];
  earliestExpiry: string | null;
};

export type EscrowDescriptor = {
  address: string;
  sellerPubkey: string;
  arbiterPubkey: string;
  serverPubkey: string;
  exitDelay: number;
  price: number;
  platformFee: number;
  /** Per-order commitment nonce (64-char hex) used to derive the unique escrow address. */
  nonce: string;
};

export type CheckoutOrder = {
  id: number;
  sellerPubkey: string;
  sellerUsername: string;
  totalSats: number;
  platformFee: number;
  status: string;
  keyIds: number[];
  escrow: EscrowDescriptor;
};

/** One line of the terms the buyer signs at checkout: what the cart showed and the buyer accepted. */
export type CheckoutItemInput = { keyId: number; sellerPubkey: string; price: number };

/** An order whose escrow names an arbiter other than the one this browser pinned (TOFU). */
export type ArbiterChange = { orderId: number; pinned: string; seen: string };

export type CheckoutResult = {
  orders: CheckoutOrder[];
  unavailableKeys: Array<{ keyId: number; reason: string }>;
  /** Non-empty → payment on these orders stays blocked until the user acknowledges the change. */
  arbiterChanges: ArbiterChange[];
};

// ─── Hooks ───────────────────────────────────────────────────────────────────

export function useCart() {
  const { data: session } = useSession();

  return useQuery({
    queryKey: ["cart"],
    queryFn: () => backend.get<CartResponse>("/cart").then((r) => r.data),
    enabled: !!session,
  });
}

// ─── Mutations ────────────────────────────────────────────────────────────────

type AddToCartResult = {
  reserved: number;
  expiresAt: string;
};

export function useAddToCart() {
  const queryClient = useQueryClient();
  const privateKey = useProfileStore((s) => s.account?.privateKey);

  return useMutation({
    mutationFn: async (payload: {
      productId: number;
      quantity: number;
      sellerPubkey?: string;
      price?: number;
    }): Promise<AddToCartResult> => {
      if (!privateKey) throw new Error("Wallet unavailable");
      return postSigned<AddToCartResult>("/cart/add", payload, privateKey);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["cart"] });
      void queryClient.invalidateQueries({ queryKey: ["stocks"] });
    },
  });
}

type RemoveFromCartResult = {
  released: number;
};

export function useRemoveFromCart() {
  const queryClient = useQueryClient();
  const privateKey = useProfileStore((s) => s.account?.privateKey);

  return useMutation({
    mutationFn: async (payload: { productId: number }): Promise<RemoveFromCartResult> => {
      if (!privateKey) throw new Error("Wallet unavailable");
      return requestSigned<RemoveFromCartResult>("DELETE", "/cart/remove", payload, privateKey);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["cart"] });
    },
  });
}

export type PayEscrowResult = {
  orderId: number;
  ok: boolean;
  txid?: string;
  error?: string;
};

/**
 * Fund each created escrow from the buyer's Arkade wallet. Sends are attempted independently so a
 * single failure (e.g. one seller's escrow) does not block the others; the per-order outcome is
 * returned for the UI to report.
 */
export function usePayEscrows() {
  return useMutation({
    mutationFn: async (orders: CheckoutOrder[]): Promise<PayEscrowResult[]> => {
      const wallet = useProfileStore.getState().wallet;
      if (!wallet) throw new Error("Wallet not initialized");

      const results: PayEscrowResult[] = [];
      for (const order of orders) {
        try {
          const txid = await wallet.send({
            address: order.escrow.address,
            amount: order.escrow.price,
          });
          results.push({ orderId: order.id, ok: true, txid });
        } catch (err) {
          results.push({
            orderId: order.id,
            ok: false,
            error: err instanceof Error ? err.message : "Payment failed",
          });
        }
      }
      return results;
    },
  });
}

/**
 * Checkout. The payload is the buyer-signed TERMS: every key with the seller and price the cart
 * showed. The server answers 409 when any of them changed meanwhile (the cart is then refetched so
 * the user re-confirms the new price). The response is verified before any funds can be sent:
 * the orders must match what was signed (keys, seller, totals), every escrow address is re-derived
 * locally, the operator key must equal the one the operator itself reports (`getInfo()` in the
 * browser) and the arbiter is checked against the TOFU pin.
 */
export function useCheckout() {
  const queryClient = useQueryClient();
  const account = useProfileStore((s) => s.account);

  return useMutation({
    mutationFn: async (payload: { items: CheckoutItemInput[] }): Promise<CheckoutResult> => {
      if (!account) throw new Error("Wallet unavailable");
      const raw = await postSigned<Omit<CheckoutResult, "arbiterChanges">>(
        "/cart/checkout",
        { items: payload.items },
        account.privateKey
      );

      const signedTerms = new Map(payload.items.map((i) => [i.keyId, i]));
      const operatorPubkey = await getOperatorSignerPubkey();

      // Verify everything first; only then pin an arbiter, so a forged response cannot plant one.
      const buyerPubkey = account.pubkey;
      for (const order of raw.orders) {
        const abort = (reason: string): never => {
          throw new Error(`Escrow verification failed for order #${order.id}: ${reason}`);
        };

        // The order must be exactly what the buyer signed: same keys, same seller, same prices.
        let signedTotal = 0;
        for (const keyId of order.keyIds) {
          const signed = signedTerms.get(keyId);
          if (!signed) abort("it contains a key you did not select");
          if (!samePubkey(signed!.sellerPubkey, order.sellerPubkey)) {
            abort("a key belongs to a different seller than the one you accepted");
          }
          signedTotal += signed!.price;
        }
        if (signedTotal !== order.totalSats) abort("the total differs from the signed prices");
        if (!samePubkey(order.escrow.sellerPubkey, order.sellerPubkey)) {
          abort("the escrow seller differs from the order seller");
        }
        if (order.escrow.price !== order.totalSats + order.platformFee) {
          abort("the escrow amount differs from the total plus the platform fee");
        }

        // Re-derive the escrow address from the descriptor and verify it matches before any funds
        // are sent. The timelock and nonce come from the server so the derivation is deterministic.
        const recomputed = deriveEscrowAddress({
          buyerPubkey,
          sellerPubkey: order.escrow.sellerPubkey,
          adminPubkey: order.escrow.arbiterPubkey,
          serverPubkey: order.escrow.serverPubkey,
          exitDelay: order.escrow.exitDelay,
          scriptNonce: order.escrow.nonce,
        });
        if (recomputed !== order.escrow.address) abort("the address does not match");

        // The operator key comes from the operator itself, never from our API.
        if (!operatorPubkey) {
          throw new Error(
            `Order #${order.id} was created but cannot be verified: the Arkade operator is unreachable. Nothing was paid; open the order and pay once the operator is available.`
          );
        }
        if (!samePubkey(operatorPubkey, order.escrow.serverPubkey)) {
          abort("the operator key does not match the Arkade operator");
        }
      }

      const arbiterChanges: ArbiterChange[] = [];
      for (const order of raw.orders) {
        const check = checkArbiter(order.escrow.arbiterPubkey);
        if (check.status === "mismatch") {
          arbiterChanges.push({ orderId: order.id, pinned: check.pinned, seen: check.seen });
        }
      }

      return { ...raw, arbiterChanges };
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["cart"] });
      void queryClient.invalidateQueries({ queryKey: ["stocks"] });
    },
    onError: () => {
      // A 409 (price/seller drift) or an unavailable key: refresh the cart so the user re-confirms.
      void queryClient.invalidateQueries({ queryKey: ["cart"] });
    },
  });
}
