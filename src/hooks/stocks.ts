"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { backend } from "@/lib/backend";
import { postSigned, requestSigned } from "@/lib/auth/signed-request";
import useProfileStore from "@/stores/profile";

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

export type StockKey = {
  id: string;
  code: string | null;
  createdAt: string;
};

export type StockTiersResponse = {
  product: { id: number; name: string; slug: string };
  tiers: StockTier[];
  tierKeys: { price: number; availableCount: number; keys: StockKey[] } | null;
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

export function useStockTierKeys(
  productId: number,
  price: number,
  options: { enabled: boolean } = { enabled: true }
) {
  return useQuery({
    queryKey: ["stocks", productId, "tiers", price, "keys"],
    queryFn: () =>
      backend
        .get<StockTiersResponse>(`/stocks/${productId}`, { params: { price } })
        .then((r) => r.data.tierKeys),
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

export function useCreateStock() {
  const queryClient = useQueryClient();
  const privateKey = useProfileStore((s) => s.account?.privateKey);

  return useMutation({
    mutationFn: async (payload: {
      productId: number;
      price: number;
      codes: string[];
    }): Promise<CreateStockResult> => {
      if (!privateKey) throw new Error("Wallet non disponibile");
      return postSigned<CreateStockResult>("/stocks", payload, privateKey);
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
