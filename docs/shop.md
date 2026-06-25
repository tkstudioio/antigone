# Domain `(shop)` — Public storefront

Product catalog accessible **without authentication**. It is the only domain with public APIs.

## Pages

- `(shop)/` — home.
- `(shop)/products` — product list (search, sort, pagination).
- `(shop)/products/[slug]` — product detail.

## API and entities

| Component      | Path                                                                                       |
| -------------- | ------------------------------------------------------------------------------------------ |
| Product list   | `src/app/api/products/route.ts` → `queryProducts()` in `src/lib/backend/query-products.ts` |
| Entities       | `Product`, `Key` (`prisma/schema.prisma`)                                                  |

## Flows

### Product list — `GET /api/products`

**Public, no session required.**

Query params:

- `search` — case-insensitive search on the name.
- `sort` — `name` | `price` | `rating` (default `name`).
- `dir` — `asc` | `desc` (default `asc`).
- `page` / `pageSize` — pagination (default page 1, pageSize 50, max 100).
- `withStock` — `1`/`true` to show only products with available keys. The list UI applies this filter by default (shows only products with stock); the «Show out-of-stock products too» checkbox disables it. Products without stock are shown in grayscale and are not clickable.

Returns `{ data, total, pageSize }` (consumed by the client as `data.data.{data,total,pageSize}` through axios).

**Server-side rendering of the first page.** `src/app/(shop)/products/page.tsx` is an `async` server component: it reads the URL `searchParams` with `createLoader(productsSearchParams)` (a map of nuqs parsers shared in `src/lib/products-search-params.ts`, also used by the client via `useQueryStates`) and calls `queryProducts()` directly on the server. The result is passed as `initialData` to `ProductsPageComponent`, which uses it to seed the first page of `useProducts` (`useInfiniteQuery`). The initial HTML therefore already contains the products — no loading flash nor refetch on the first render. The parameter mapping replicates exactly the one on the client (in particular `withStock = showOutOfStock ? undefined : true`, `page: 1`, default `pageSize`) to avoid hydration mismatches; infinite scroll keeps calling `GET /api/products?page=N` for the following pages.

### Product detail — `(shop)/products/[slug]`

The page (server component) resolves the product by `slug` via `queryProductDetail()`. The layout is a **hero** (image, name `H1`, star rating, description) followed by the **«All sellers»** table. `queryProductDetail()` groups the available keys by `(sellerPubkey, price)` — a "stock" is therefore a seller + price tier pair (the same seller can appear on multiple rows if they have different prices). The rows are sorted by ascending price; the first row carries the «Best price» badge. If no stock is available the page shows a message instead of the table.

**Per-stock purchase.** `ProductStocksTable` (client component) makes each row purchasable: quantity (`min 1`, `max availableCount`) + an «Add» button that calls `useAddToCart` with `{ productId, quantity, sellerPubkey, price }`. The user can therefore buy from **any** seller, not just the cheapest one. The controls are disabled without a session or when out of stock. From here the authenticated user starts the cart → checkout flow (see [account/cart.md](./account/cart.md): the targeted reservation happens in `reserveKeys` filtering by `sellerPubkey`/`price`). The quick-add of the catalog cards (`ProductCard`) remains instead a «best price» purchase (it omits `sellerPubkey`/`price`).

It exports `generateMetadata()` for SEO: `title`, `description` (extracted from the product description, truncated to 160 characters), canonical, and Open Graph / Twitter tags (image = `imageUrl` if present). The DB query is shared between `generateMetadata` and the page render via React's `cache()` (a single fetch per request). The `metadataBase` and the title template (`%s · Antigone`) are defined in the root layout `src/app/layout.tsx`.

### SEO — sitemap and robots

- `src/app/sitemap.ts` (`force-dynamic`) generates `/sitemap.xml`: home, `/products`, and one entry for each `/products/[slug]` (it queries `db.product` directly, `lastModified = createdAt`). The detail pages are the real indexing targets; the listing remains an entry point with only the first page rendered server-side (infinite scroll does not produce crawlable paginated URLs).
- `src/app/robots.ts` allows crawling of the public storefront, excludes the authenticated/admin areas (`/api/`, `/cart`, `/wallet`, `/stocks`, `/orders`, `/disputes`) and points to the sitemap.
- Base URL = `NEXTAUTH_URL`.

## Notes

- License keys (`Key`) are the goods: each key belongs to a `Product` and to a seller, with a `price` in satoshi.
- A key's availability depends on `orderId` (not sold) and on the reservation (`reservedBy`/`reservedUntil`) — see the cart flow in the dashboard domain.
