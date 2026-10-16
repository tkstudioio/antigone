# Stock (seller side)

Endpoints: `src/app/api/stocks/route.ts`, `src/app/api/stocks/[productId]/route.ts`,
`src/app/api/stocks/keys/route.ts`. Backend: `src/lib/backend/mutations-stocks.ts`,
`query-stocks.ts`.

| Flow                       | Endpoint                      | Backend                                                                                                 |
| -------------------------- | ----------------------------- | ------------------------------------------------------------------------------------------------------- |
| List own stock             | `GET /api/stocks`             | `queryStockProducts()` (count of available keys + minimum price)                                        |
| Tiers of a product         | `GET /api/stocks/[productId]` | `queryStockTiers()` / `queryStockTier()`                                                                |
| Upload keys / create stock | `POST /api/stocks`            | `upsertStockKeys()` — max 1000 codes, **already E2E-encrypted client-side**; 409 on an archived product |
| Update tier price          | `PATCH /api/stocks`           | `updateStockPrice()` (can merge tiers)                                                                  |
| Delete tier                | `DELETE /api/stocks`          | `deleteStock()` — 409 if all are in escrow                                                              |
| Delete specific keys       | `DELETE /api/stocks/keys`     | `deleteKeysFromStock()`                                                                                 |

Prices are organized into **tiers**: keys of the same product and same price form a tier.

**Archived products.** When the admin archives a product (see [admin.md](../admin.md), Catalog) its
keys are no longer on sale and `POST /api/stocks` refuses new ones (409). The seller still sees the
stock: `queryStockProducts()` returns `archived`, the list row shows an «Archived · not on sale»
badge and the detail page an alert; the keys can still be deleted.

## Detail page (`stocks/[productSlug]`)

Shows, in order: a "Back to stocks" CTA, an H1 title (product name), a summary line (tiers · total
available keys), then one card per tier (`StockTierDetail`). Each card reports price and availability
with the tier actions (add keys, edit price, delete stock), then a selection bar (selected count,
«Remove selected», disabled when every key is selected — use «Delete stock» instead) and the table
of selectable keys, always visible (no accordion).

## List page (`stocks`)

A toolbar with search (debounced, `search` in the URL), sort (`SegmentedControl`: name, available,
lowest price → `sort`/`dir` in the URL) and a «Filters» popover with the price/keys range sliders.
The ranges are **client-side** and filter only the rows of the current page. Products are rows of a
single list (tiers, availability badge + bar, available keys, price range), each linking to the
detail page.

## Add stock wizard (`create-stock-dialog.tsx`)

`CreateStockDialog` is a multi-step dialog with a step indicator (completed steps are clickable to go
back); each step validates its own fields before «Next».

- **Create** (`mode="create"`, «Add stock» on the list page): **Product** (search box + grid of
  product cards from `useProducts`, showing the market's lowest price) → **Price** (per key, sats; hints
  the market's lowest price) → **Keys** (one per line, trimmed + deduplicated, max 1000) → **Review**
  (product, price per key, total keys, total value in sats; confirm or cancel).
- **Append** (`mode="append"`, «Add keys» on a tier): product and price are fixed, so only **Keys** →
  **Review**.

Confirming calls `useCreateStock`; the dialog cannot be closed while the upload is pending. A new
stock redirects to `stocks/[productSlug]`, otherwise a toast reports inserted/skipped counts.

## Code encryption (E2E)

License key codes are **end-to-end encrypted**: the server never sees a plaintext code.

- **Upload** (`useCreateStock`, `src/hooks/stocks.ts`): the seller's browser trims, deduplicates and
  encrypts each code into an envelope **addressed to the seller only**, and computes a dedup hash
  (HMAC-SHA256 keyed by a secret derived via HKDF from the seller's private key). Payload:
  `{ productId, price, codes: [{ ciphertext, wrappedCek, codeHash }] }` (max 1000). `upsertStockKeys`
  stores `Key.code` = ciphertext, one `KeyCodeKey` row for the seller (`wrapper = recipient = seller`)
  and `Key.codeHash` = the client hash; dedup on `(sellerPubkey, productId, codeHash)`, duplicates are
  skipped and counted in `skipped`. A malformed envelope or more than 1000 codes → 422. The signed
  body (stored in `SignedAction`, no `storeBody: false` exception anymore) contains only ciphertext.
- **Read** (`GET /api/stocks/[productId]?price=`, `queryStockTier`): returns, for each key,
  `{ ciphertext, wrappedCek, wrapperPubkey }` (the seller's own wrap); `useStockTierKeys` decrypts in the
  browser. A key that cannot be opened shows «Unable to decrypt». A locked wallet blocks the upload
  with «Wallet unavailable».

Detail in [crypto/at-rest.md](../crypto/at-rest.md). The seller later **delivers** the keys to the buyer
by re-wrapping them at order confirmation: see [orders.md](./orders.md).
