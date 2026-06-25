import { backend } from "@/lib/backend";
import { useInfiniteQuery } from "@tanstack/react-query";
import type { InfiniteData } from "@tanstack/react-query";

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

export function useProducts(
  params: Partial<{
    sort: SortColumn;
    dir: SortDir;
    search: string;
    withStock: boolean;
  }>,
  initialData?: ProductsResponse
) {
  // Cast initialData to the InfiniteData shape or undefined.
  // Using `as InfiniteData<...> | undefined` prevents TypeScript from picking
  // the "definedInitialData" overload of useInfiniteQuery, which would narrow
  // isPending/data types and break ts-pattern exhaustiveness checking.
  const seedData: InfiniteData<ProductsResponse, number> | undefined = initialData
    ? { pages: [initialData], pageParams: [1] }
    : undefined;

  return useInfiniteQuery({
    queryKey: ["products", params],
    queryFn: ({ pageParam }) =>
      backend
        .get<ProductsResponse>("/products", { params: { ...params, page: pageParam } })
        .then((r) => r.data),
    initialPageParam: 1,
    getNextPageParam: (lastPage, allPages) => {
      const fetched = allPages.length * lastPage.pageSize;
      return fetched < lastPage.total ? allPages.length + 1 : undefined;
    },
    initialData: seedData,
  });
}
