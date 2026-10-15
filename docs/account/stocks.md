# Stock (seller side)

Endpoints: `src/app/api/stocks/route.ts`, `src/app/api/stocks/[productId]/route.ts`,
`src/app/api/stocks/keys/route.ts`. Backend: `src/lib/backend/mutations-stocks.ts`,
`query-stocks.ts`.

| Flow                       | Endpoint                      | Backend                                                                     |
| -------------------------- | ----------------------------- | --------------------------------------------------------------------------- |
| List own stock             | `GET /api/stocks`             | `queryStockProducts()` (count of available keys + minimum price)            |
| Tiers of a product         | `GET /api/stocks/[productId]` | `queryStockTiers()` / `queryStockTier()`                                    |
| Upload keys / create stock | `POST /api/stocks`            | `upsertStockKeys()` — max 1000 codes, **already E2E-encrypted client-side** |
| Update tier price          | `PATCH /api/stocks`           | `updateStockPrice()` (can merge tiers)                                      |
| Delete tier                | `DELETE /api/stocks`          | `deleteStock()` — 409 if all are in escrow                                  |
| Delete specific keys       | `DELETE /api/stocks/keys`     | `deleteKeysFromStock()`                                                     |

Prices are organized into **tiers**: keys of the same product and same price form a tier.

## Detail page (`stocks/[productSlug]`)

Shows, in order: a "Back to stock" CTA, an H1 title (product name), then one card per tier
(`StockTierDetail`). Each card reports price and availability, the actions (remove selected, add keys,
edit price, delete stock) and — below the actions — the list of selectable keys always visible (no
accordion).

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
