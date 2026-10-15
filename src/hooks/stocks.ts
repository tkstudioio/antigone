"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { backend } from "@/lib/backend";
import { postSigned, requestSigned } from "@/lib/auth/signed-request";
import useProfileStore from "@/stores/profile";
import { sealCodeForSeller, openStoredCode, type CodeStatus } from "@/lib/crypto/code-envelope";

// ─── Types ───────────────────────────────────────────────────────────────────

export type StockProduct = {
  productId: number;
  name: string;
  slug: string;
  availableKeysCount: number;
  lowestPrice: number;
  highestPrice: number;
  priceTiers: number;
};

export type StockProductsResponse = {
  data: StockProduct[];
  total: number;
  page: number;
  pageSize: number;
};

export type StockTier = {
  price: number;
  availableCount: number;
};

/** A stock key as returned by the API: E2E ciphertext + the seller's own wrapped content key. */
export type StockKeyRaw = {
  id: string;
  ciphertext: string;
  wrappedCek: string | null;
  wrapperPubkey: string | null;
  createdAt: string;
};

/** A stock key after the browser decrypted it (`code` is null when it cannot be opened). */
export type StockKey = StockKeyRaw & {
  code: string | null;
  codeStatus: CodeStatus;
};

export type StockTiersResponse = {
  product: { id: number; name: string; slug: string };
  tiers: StockTier[];
  tierKeys: { price: number; availableCount: number; keys: StockKeyRaw[] } | null;
};

export type StockSortColumn = "name" | "availableKeysCount" | "lowestPrice";
export type SortDir = "asc" | "desc";

// ─── Hooks ───────────────────────────────────────────────────────────────────

export function useStockProducts(
  params: Partial<{
    page: number;
    sort: StockSortColumn;
    dir: SortDir;
    search: string;
  }>
) {
  return useQuery({
    queryKey: ["stocks", params],
    queryFn: () => backend.get<StockProductsResponse>("/stocks", { params }).then((r) => r.data),
  });
}

export function useStockTiers(productId: number) {
  return useQuery({
    queryKey: ["stocks", productId, "tiers"],
    queryFn: () => backend.get<StockTiersResponse>(`/stocks/${productId}`).then((r) => r.data),
    enabled: productId > 0,
  });
}

/**
 * Keys of one tier. The API returns ciphertext + the seller's wrapped key; the codes are decrypted
 * here with the private key held in memory (same pattern as `decryptChatMessages`).
 */
export function useStockTierKeys(
  productId: number,
  price: number,
  options: { enabled: boolean } = { enabled: true }
) {
  const privateKey = useProfileStore((s) => s.account?.privateKey);
  const pubkey = useProfileStore((s) => s.account?.pubkey);
  return useQuery({
    queryKey: ["stocks", productId, "tiers", price, "keys", pubkey, Boolean(privateKey)],
    queryFn: async () => {
      const { data } = await backend.get<StockTiersResponse>(`/stocks/${productId}`, {
        params: { price },
      });
      const tier = data.tierKeys;
      if (!tier) return null;
      const keys: StockKey[] = await Promise.all(
        tier.keys.map(async (k) => {
          const { code, status } = await openStoredCode({
            recipientPrivHex: privateKey,
            ciphertext: k.ciphertext,
            wrappedCek: k.wrappedCek,
            wrapperPubkey: k.wrapperPubkey,
          });
          return { ...k, code, codeStatus: status };
        })
      );
      return { ...tier, keys };
    },
    enabled: options.enabled && productId > 0,
  });
}

// ─── Mutations ────────────────────────────────────────────────────────────────

type CreateStockResult = {
  inserted: number;
  skipped: number;
  isNew: boolean;
  productSlug: string;
};

/**
 * Upload keys. The codes never leave the browser in clear: each one is trimmed, deduplicated,
 * encrypted into an envelope addressed to the seller only, and sent with a seller-keyed dedup hash.
 */
export function useCreateStock() {
  const queryClient = useQueryClient();
  const account = useProfileStore((s) => s.account);

  return useMutation({
    mutationFn: async (payload: {
      productId: number;
      price: number;
      codes: string[];
    }): Promise<CreateStockResult> => {
      if (!account?.privateKey) throw new Error("Wallet unavailable");
      const { privateKey, pubkey } = account;

      const uniqueCodes = [
        ...new Set(payload.codes.map((c) => c.trim()).filter((c) => c.length > 0)),
      ];
      if (uniqueCodes.length === 0) throw new Error("Enter at least one key");

      const codes = await Promise.all(
        uniqueCodes.map((code) =>
          sealCodeForSeller({ sellerPrivHex: privateKey, sellerPubHex: pubkey, code })
        )
      );
      return postSigned<CreateStockResult>(
        "/stocks",
        { productId: payload.productId, price: payload.price, codes },
        privateKey
      );
    },
    onSuccess: (_data, variables) => {
      void queryClient.invalidateQueries({ queryKey: ["stocks"] });
      void queryClient.invalidateQueries({
        queryKey: ["stocks", variables.productId, "tiers"],
      });
      void queryClient.invalidateQueries({
        queryKey: ["stocks", variables.productId, "tiers", variables.price, "keys"],
      });
    },
  });
}

type UpdateStockPriceResult = {
  updated: number;
  newPrice: number;
  merged: boolean;
};

export function useUpdateStockPrice() {
  const queryClient = useQueryClient();
  const privateKey = useProfileStore((s) => s.account?.privateKey);

  return useMutation({
    mutationFn: async (payload: {
      productId: number;
      oldPrice: number;
      newPrice: number;
    }): Promise<UpdateStockPriceResult> => {
      if (!privateKey) throw new Error("Wallet non disponibile");
      return requestSigned<UpdateStockPriceResult>("PATCH", "/stocks", payload, privateKey);
    },
    onSuccess: (_data, variables) => {
      void queryClient.invalidateQueries({ queryKey: ["stocks"] });
      void queryClient.invalidateQueries({
        queryKey: ["stocks", variables.productId, "tiers"],
      });
    },
  });
}

type DeleteStockResult = {
  deleted: number;
};

export function useDeleteStock() {
  const queryClient = useQueryClient();
  const privateKey = useProfileStore((s) => s.account?.privateKey);

  return useMutation({
    mutationFn: async (payload: {
      productId: number;
      price: number;
    }): Promise<DeleteStockResult> => {
      if (!privateKey) throw new Error("Wallet non disponibile");
      return requestSigned<DeleteStockResult>("DELETE", "/stocks", payload, privateKey);
    },
    onSuccess: (_data, variables) => {
      void queryClient.invalidateQueries({ queryKey: ["stocks"] });
      void queryClient.invalidateQueries({
        queryKey: ["stocks", variables.productId, "tiers"],
      });
    },
  });
}

type DeleteKeysResult = {
  deleted: number;
  notFound: number;
};

export function useDeleteKeysFromStock(productId?: number) {
  const queryClient = useQueryClient();
  const privateKey = useProfileStore((s) => s.account?.privateKey);

  return useMutation({
    mutationFn: async (payload: { keyIds: string[] }): Promise<DeleteKeysResult> => {
      if (!privateKey) throw new Error("Wallet non disponibile");
      return requestSigned<DeleteKeysResult>("DELETE", "/stocks/keys", payload, privateKey);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["stocks"] });
      if (productId !== undefined) {
        void queryClient.invalidateQueries({
          queryKey: ["stocks", productId, "tiers"],
        });
      }
    },
  });
}
