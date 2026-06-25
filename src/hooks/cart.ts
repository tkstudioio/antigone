"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSession } from "next-auth/react";
import { backend } from "@/lib/backend";
import { postSigned, requestSigned } from "@/lib/auth/signed-request";
import useProfileStore from "@/stores/profile";
import { deriveEscrowAddress } from "@/lib/ark/escrow";

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
  /** Per-order commitment nonce (64-char hex) used to derive the unique escrow address. */
  nonce: string;
};

export type CheckoutOrder = {
  id: number;
  sellerPubkey: string;
  sellerUsername: string;
  totalSats: number;
  status: string;
  keyIds: number[];
  escrow: EscrowDescriptor;
};

export type CheckoutResult = {
  orders: CheckoutOrder[];
  unavailableKeys: Array<{ keyId: number; reason: string }>;
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

export function useCheckout() {
  const queryClient = useQueryClient();
  const account = useProfileStore((s) => s.account);

  return useMutation({
    mutationFn: async (payload: { keyIds: number[] }): Promise<CheckoutResult> => {
      if (!account) throw new Error("Wallet unavailable");
      const result = await postSigned<CheckoutResult>(
        "/cart/checkout",
        payload,
        account.privateKey
      );

      // Re-derive each escrow address from the server-provided descriptor and
      // verify it matches before any funds are sent. The timelock and nonce come
      // from the server so the derivation is deterministic.
      const buyerPubkey = account.pubkey;
      for (const order of result.orders) {
        const recomputed = deriveEscrowAddress({
          buyerPubkey,
          sellerPubkey: order.escrow.sellerPubkey,
          adminPubkey: order.escrow.arbiterPubkey,
          serverPubkey: order.escrow.serverPubkey,
          exitDelay: order.escrow.exitDelay,
          scriptNonce: order.escrow.nonce,
        });
        if (recomputed !== order.escrow.address) {
          throw new Error(
            `Escrow verification failed for order #${order.id}: the address does not match`
          );
        }
      }

      return result;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["cart"] });
      void queryClient.invalidateQueries({ queryKey: ["stocks"] });
    },
  });
}
