# Domain `(shop)` — Public storefront

Product catalog accessible **without authentication**. It is the only domain with public APIs.

## Layout shell

`src/app/(shop)/layout.tsx` is the storefront shell (server component; it redirects the admin to
`/disputes`). Four parts, each with a single responsibility:

- **Skip link** — first focusable element, targets `#main`, visible only on focus.
- **Sticky header** (`sticky top-0 z-40`, `border-b` + backdrop blur; sticky in normal flow, so it
  keeps its space and never covers the first section): the icon logo linking home, the public nav
  (`src/components/shop-nav.tsx`) and the session-aware action area. Logged in → the **account
  tile** toward `/dashboard` (identicon + `session.user.username` + truncated pubkey; identicon
  only below `sm`, `aria-label` «My account: …») followed by the **cart** trigger (`CartSheet`, the
  rightmost action, so the sheet opens from the edge next to it — see
  [account/cart.md](./account/cart.md)); visitor → **«Log in»** (label from `sm` up, `aria-label`
  on narrower screens). The shop shell
  deliberately offers only this one entry point into the account area: the `(account)` sidebar owns
  that navigation (see [account.md](./account.md)).
- **`<main id="main">`** — container and top offset only (`container mx-auto px-4 pt-6 md:px-8
md:pt-10`). **Each page owns its own vertical rhythm** (the home page's `space-y-24 pb-24`, the
  catalog's `space-y-8 pb-24`); the shell adds no `space-y`, so there is one spacing system per
  page instead of two competing ones.
- **Footer** (`src/components/shop-footer.tsx`) — brand column (logo, one-line pitch, the
  «Bitcoin · Ark escrow · No passwords» chip) plus two link columns, each a labelled `<nav>`:
  _Browse_ (catalog + the home anchors) and _Your account_ / _Get started_, switched on the session.
  Every href points at a route that exists — there are no legal or docs pages to link yet, so the
  bottom bar carries the year and the non-custodial guarantee instead.

`ShopNav` is the only client component of the shell: it needs `usePathname` to mark the active
route (`data-active` + `aria-current="page"`). Its items are either routes (with a `match` prefix)
or in-page anchors toward the home page's section headings — anchors never claim an active state.
Those headings carry `scroll-mt-24` (`SectionHeading` in `(shop)/page.tsx`) so the sticky header
does not cover them when an anchor is followed.

## Pages

- `(shop)/` — home (landing). Async server component: hero with an illustrative escrow card, the
  «Top-rated in the catalog» strip (up to 4 in-stock products, best `rating` first, from
  `queryProducts({ withStock: true })` called directly on the server; hidden when nothing is in
  stock), the platform principles, the five-step trade flow + dispute note, the wallet section, and a
  closing CTA. The secondary CTA is session-aware: «Create your key» (`/create`) for visitors, «Sell
  your keys» (`/stocks`) for logged-in users.
- `(shop)/products` — product list (search, sort, out-of-stock toggle, pagination), rendered on the server.
- `(shop)/products/[slug]` — product detail.

## API and entities

| Component    | Path                                                                                       |
| ------------ | ------------------------------------------------------------------------------------------ |
| Product list | `src/app/api/products/route.ts` → `queryProducts()` in `src/lib/backend/query-products.ts` |
| Entities     | `Product`, `Key` (`prisma/schema.prisma`)                                                  |

## Flows

### Product list — `GET /api/products`

**Public, no session required.**

Query params:

- `search` — case-insensitive search on the name.
- `sort` — `name` | `price` | `rating` (default `name`).
- `dir` — `asc` | `desc` (default `asc`).
- `page` / `pageSize` — pagination (default page 1, pageSize 50, max 100).
- `withStock` — `1`/`true` to show only products with available keys.

Returns `{ data, total, page, pageSize, pageCount }`. The API is used by `useProducts`
(`src/hooks/products.ts`, first page only) for search pickers such as the add-stock wizard; the catalog
page does not call it.

### Catalog page — `(shop)/products`

`src/app/(shop)/products/page.tsx` is an `async` server component that renders the whole list: it reads
the URL with `createLoader(productsSearchParams)` (nuqs parsers shared in
`src/lib/products-search-params.ts`) and calls `queryProducts()` directly. Layout: eyebrow + H1 + intro,
the `ProductsFilters` toolbar, the result count, a grid of `ProductTile`s (`src/components/product-tile.tsx`,
shared with the home page) and `ProductsPagination`.

- **Filters** (`ProductsFilters`, client): debounced search, sort (`SegmentedControl`: Name, Lowest
  price, Top rated → `sort`/`dir`) and a «Show out of stock» switch (by default only products with stock
  are listed: `withStock = showOutOfStock ? undefined : true`). It writes the URL through
  `useQueryStates(productsSearchParams, { shallow: false, startTransition })`, so every change re-renders
  the server page (spinner in the search box while pending) and resets `page` to 1.
- **Tiles**: image, name, lowest price, keys in stock, rating. Out-of-stock products are greyed out and
  not clickable.
- **Pagination** (`ProductsPagination`, server): real `Link`s whose `href` is built with
  `createSerializer(productsSearchParams)`, so they keep the filters and are crawlable.
- Empty state when nothing matches.

### Product detail — `(shop)/products/[slug]`

The page (server component) resolves the product by `slug` via `queryProductDetail()` and reads the session. The layout is a **hero** (image, name `H1`, star rating, description, a summary of best price · available keys · sellers, and an escrow note) followed by the **«All sellers»** list. `queryProductDetail()` groups the available keys by `(sellerPubkey, price)` — a "stock" is therefore a seller + price tier pair (the same seller can appear on multiple rows if they have different prices). The rows are sorted by ascending price; the first row carries the «Best price» badge. If no stock is available the page shows an empty state instead of the list.

**Per-stock purchase.** `ProductSellers` (`src/components/product-sellers.tsx`, client) makes each row purchasable: seller identicon + username, price, availability, a quantity stepper (clamped to `1…availableCount`) and an «Add» button that calls `useAddToCart` with `{ productId, quantity, sellerPubkey, price }`, then toasts the reservation and calls `router.refresh()` to update the counts. The user can therefore buy from **any** seller, not just the cheapest one. Without a session the controls are disabled and a «Log in» prompt is shown; the viewer's own stock is marked «Your stock» and is not purchasable. From here the authenticated user starts the cart → checkout flow (see [account/cart.md](./account/cart.md): the targeted reservation happens in `reserveKeys` filtering by `sellerPubkey`/`price`). The catalog tiles have no quick-add: buying always goes through this page.

It exports `generateMetadata()` for SEO: `title`, `description` (extracted from the product description, truncated to 160 characters), canonical, and Open Graph / Twitter tags (image = `imageUrl` if present). The DB query is shared between `generateMetadata` and the page render via React's `cache()` (a single fetch per request). The `metadataBase` and the title template (`%s · Antigone`) are defined in the root layout `src/app/layout.tsx`.

### SEO — sitemap and robots

- `src/app/sitemap.ts` (`force-dynamic`) generates `/sitemap.xml`: home, `/products`, and one entry for each `/products/[slug]` (it queries `db.product` directly, `lastModified = createdAt`). The detail pages are the real indexing targets; the listing remains an entry point with only the first page rendered server-side (infinite scroll does not produce crawlable paginated URLs).
- `src/app/robots.ts` allows crawling of the public storefront, excludes the authenticated/admin areas (`/api/`, `/cart`, `/wallet`, `/stocks`, `/orders`, `/disputes`) and points to the sitemap.
- Base URL = `NEXTAUTH_URL`.

## Notes

- License keys (`Key`) are the goods: each key belongs to a `Product` and to a seller, with a `price` in satoshi.
- A key's availability depends on `orderId` (not sold) and on the reservation (`reservedBy`/`reservedUntil`) — see the cart flow in the dashboard domain.
