---
name: tanstack-query
description: How to use TanStack React Query (v5) for data fetching and mutations. Use this skill whenever you need to fetch data from APIs, submit form data, handle server state, or wire up any async operation in React components. Also use it when the user mentions queries, mutations, caching, refetching, query invalidation, optimistic updates, or loading/error states for server data.
---

# TanStack React Query in this project

This project uses **TanStack React Query v5** (`@tanstack/react-query`). All async server interactions — fetches, form submissions, data mutations — go through React Query hooks, never raw `fetch`/`axios` in components.

## Core principles

1. **Custom hooks encapsulate queries and mutations.** Components never call `useQuery`/`useMutation` directly. Instead, create a `useXxx` hook in `src/hooks/` that wraps the React Query call with proper typing and key management.

2. **Types come from Zod schemas.** Define the shape with Zod, infer the TypeScript type with `z.infer<typeof schema>`, and use that type to constrain the mutation/query function.

3. **Query keys are descriptive arrays.** Use string arrays that read like a path: `["products"]`, `["products", productId]`, `["price-lists", listId, "entries"]`.

4. **Use the `backend` axios client for all HTTP calls.** Import `backend` from `@/lib/backend` — it has `baseURL: "/api"` and default headers pre-configured. Never use raw `fetch`.

## useMutation

For any operation that writes data (form submissions, creates, updates, deletes).

```ts
import { useMutation } from "@tanstack/react-query";
import { backend } from "@/lib/backend";

export function useCreateProductMutation() {
  return useMutation({
    mutationKey: ["create-product"],
    mutationFn: async (values: CreateProductSchema) => {
      const { data } = await backend.post("/products", values);
      return data;
    },
  });
}
```

### Mutation callbacks

Use `onSuccess`, `onError`, and `onSettled` for side effects after mutation completes:

```ts
return useMutation({
  mutationKey: ["update-product"],
  mutationFn: async (values: UpdateProductSchema) => {
    /* ... */
  },
  onSuccess: () => {
    queryClient.invalidateQueries({ queryKey: ["products"] });
  },
  onError: (error) => {
    toast.error(error.message);
  },
});
```

To access `queryClient` inside callbacks, use `useQueryClient()`:

```ts
import { useMutation, useQueryClient } from "@tanstack/react-query";

export function useDeleteProductMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationKey: ["delete-product"],
    mutationFn: async (id: string) => {
      /* ... */
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["products"] });
    },
  });
}
```

### Using a mutation in a component

```tsx
const mutation = useCreateProductMutation();

<form onSubmit={form.handleSubmit((values) => mutation.mutate(values))}>
```

The mutation object exposes useful state:

- `mutation.isPending` — show loading spinner on submit button
- `mutation.isError` — show error banner
- `mutation.error` — the error object
- `mutation.isSuccess` — show success feedback

## useQuery

For reading data from the server.

```ts
import { useQuery } from "@tanstack/react-query";
import { backend } from "@/lib/backend";

export function useProducts() {
  return useQuery({
    queryKey: ["products"],
    queryFn: async () => {
      const { data } = await backend.get<Product[]>("/products");
      return data;
    },
  });
}
```

### Common options

```ts
useQuery({
  queryKey: ["product", productId],
  queryFn: () => fetchProduct(productId),
  enabled: !!productId, // don't fetch until we have an ID
  staleTime: 5 * 60 * 1000, // consider fresh for 5 minutes
  refetchOnWindowFocus: false, // don't refetch when user returns to tab
});
```

### Using a query in a component

```tsx
const { data, isPending, isError, error } = useProducts();

if (isPending) return <Skeleton />;
if (isError) return <p>Error: {error.message}</p>;

return <ProductList products={data} />;
```

## Query invalidation

After a mutation succeeds, invalidate related queries so the UI reflects the new state:

```ts
queryClient.invalidateQueries({ queryKey: ["products"] });
```

Invalidation is prefix-based: `{ queryKey: ["products"] }` invalidates `["products"]`, `["products", "123"]`, and `["products", { page: 2 }]`.

## File organization

```
src/hooks/
  use-login.ts          — useLoginForm() + useLoginMutation()
  use-products.ts       — useProducts() + useCreateProductMutation()
  use-price-list.ts     — usePriceList(id) + useImportPriceListMutation()
```

Each file groups the query/mutation hooks for one domain concept. The form hook (if any) lives in the same file since it's tightly coupled to the mutation's input type.

## QueryClientProvider

The app must wrap the component tree with `QueryClientProvider`. This is already set up — if you need to verify, check the root layout or providers file.

```tsx
"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(() => new QueryClient());
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}
```

The `useState` pattern ensures each request in SSR gets its own `QueryClient` — never create it at module scope.
