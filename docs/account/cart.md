# Cart / reservation

| Flow             | Endpoint                  | Backend              |
| ---------------- | ------------------------- | -------------------- |
| Add to cart      | `POST /api/cart/add`      | `reserveKeys()`      |
| View cart        | `GET /api/cart`           | `queryCart()`        |
| Remove product   | `DELETE /api/cart/remove` | `releaseCartItems()` |
| Clear cart       | `DELETE /api/cart`        | `clearCart()`        |

Backend: `src/lib/backend/mutations-cart.ts`, `src/lib/backend/query-cart.ts`.

> The "cart" is not an entity in itself: it is the set of `Key`s reserved by a `buyerPubkey`. The
> reservation is ephemeral (10 min).

## `reserveKeys` (transaction)

Selects the `quantity` keys of the product that are `orderId = null` (not sold) and not reserved (or
with an expired `reservedUntil`), and sets `reservedBy = buyer`, `reservedUntil = now + 10 minutes`
(`RESERVATION_MINUTES`). 409 error if the available keys are fewer than those requested.

The `POST /api/cart/add` payload (`addToCartSchema`) optionally accepts `sellerPubkey` and `price`:

- **present** → the reservation is restricted to **that stock** (seller + exact price tier), so the
  buyer never pays a tier different from the one shown. The storefront's product detail page (see
  [shop.md](../shop.md)) always passes them — one purchase per row of the sellers table.
- **absent** → default **cheapest-first** across all sellers (`orderBy: price asc`). The catalog
  cards' quick-add omits them.

## `releaseCartItems` / `clearCart`

Reset `reservedBy`/`reservedUntil` (per product or for the entire cart).
