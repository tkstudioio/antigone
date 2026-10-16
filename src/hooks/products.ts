import { backend } from "@/lib/backend";
import { keepPreviousData, useQuery } from "@tanstack/react-query";

export type Product = {
  id: number;
  name: string;
  slug: string;
  description: string | null;
  rating: number | null;
  imageUrl: string | null;
  lowestPrice: number | null;
  availableKeysCount: number;
};

export type ProductsResponse = {
  data: Product[];
  total: number;
  page: number;
  pageSize: number;
  pageCount: number;
};

export type SortColumn = "name" | "price" | "rating";
export type SortDir = "asc" | "desc";

// First page only: the storefront list is paginated server-side, this serves search pickers.
export function useProducts(
  params: Partial<{
    sort: SortColumn;
    dir: SortDir;
    search: string;
    withStock: boolean;
  }>
) {
  return useQuery({
    queryKey: ["products", params],
    queryFn: () => backend.get<ProductsResponse>("/products", { params }).then((r) => r.data),
    // Keep showing the previous results while a new search loads.
    placeholderData: keepPreviousData,
  });
}
