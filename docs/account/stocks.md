# Stock (seller side)

Endpoints: `src/app/api/stocks/route.ts`, `src/app/api/stocks/[productId]/route.ts`,
`src/app/api/stocks/keys/route.ts`. Backend: `src/lib/backend/mutations-stocks.ts`,
`query-stocks.ts`.

| Flow                       | Endpoint                      | Backend                                                               |
| -------------------------- | ----------------------------- | --------------------------------------------------------------------- |
| List own stock             | `GET /api/stocks`             | `queryStockProducts()` (count of available keys + minimum price)      |
| Tiers of a product         | `GET /api/stocks/[productId]` | `queryStockTiers()` / `queryStockTier()`                              |
| Upload keys / create stock | `POST /api/stocks`            | `upsertStockKeys()` — max 1000 codes, trim and discard empty ones     |
| Update tier price          | `PATCH /api/stocks`           | `updateStockPrice()` (can merge tiers)                                |
| Delete tier                | `DELETE /api/stocks`          | `deleteStock()` — 409 if all are in escrow                            |
| Delete specific keys       | `DELETE /api/stocks/keys`     | `deleteKeysFromStock()`                                               |

Prices are organized into **tiers**: keys of the same product and same price form a tier.

## Detail page (`stocks/[productSlug]`)

Shows, in order: a "Back to stock" CTA, an H1 title (product name), then one card per tier
(`StockTierDetail`). Each card reports price and availability, the actions (remove selected, add keys,
edit price, delete stock) and — below the actions — the list of selectable keys always visible (no
accordion).

## Code encryption

License key codes are **encrypted at rest**: the upload (`upsertStockKeys`) encrypts the code and
stores an HMAC `code_hash` for dedup; the reads (`queryStockTier`, `query-orders`) decrypt server-side
via `safeDecryptCode` before returning the code to an authorized seller/buyer/admin. Detail in
[crypto/at-rest.md](../crypto/at-rest.md).
