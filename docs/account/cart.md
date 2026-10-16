# Cart / reservation

| Flow           | Endpoint                  | Backend              |
| -------------- | ------------------------- | -------------------- |
| Add to cart    | `POST /api/cart/add`      | `reserveKeys()`      |
| View cart      | `GET /api/cart`           | `queryCart()`        |
| Remove product | `DELETE /api/cart/remove` | `releaseCartItems()` |
| Clear cart     | `DELETE /api/cart`        | `clearCart()`        |

Backend: `src/lib/backend/mutations-cart.ts`, `src/lib/backend/query-cart.ts`.

> The "cart" is not an entity in itself: it is the set of `Key`s reserved by a `buyerPubkey`. The
> reservation is ephemeral (10 min).

## `reserveKeys` (transaction)

Selects the `quantity` keys of the product that are `orderId = null` (not sold) and not reserved (or
with an expired `reservedUntil`), skipping products archived by the admin (`product.archivedAt = null`),
then claims them with **one conditional `updateMany`** that repeats
the availability filter (`orderId = null`, no live reservation) and sets `reservedBy = buyer`,
`reservedUntil = now + 10 minutes` (`RESERVATION_MINUTES`). The update count must equal `quantity`,
otherwise the transaction rolls back: two buyers racing for the same key cannot both reserve it.

Failures are typed and the route answers **409** with the message: `NotEnoughKeysError` (fewer
available keys than requested, or a concurrent reservation took some) and `ReservationCapError`.
Only genuinely unexpected failures remain 500.

**Reserved-keys cap.** In the same transaction the buyer's live reservations
(`reservedBy = buyer`, `reservedUntil >= now`) are counted; if that count plus `quantity` would exceed
`MAX_RESERVED_KEYS_PER_ACCOUNT` (default **50**, env override) the reservation is refused. The
checkout re-validates the reservation atomically — see [orders.md](./orders.md).

The `POST /api/cart/add` payload (`addToCartSchema`) optionally accepts `sellerPubkey` and `price`:

- **present** → the reservation is restricted to **that stock** (seller + exact price tier), so the
  buyer never pays a tier different from the one shown. The storefront's product detail page (see
  [shop.md](../shop.md)) always passes them — one purchase per row of the sellers table.
- **absent** → default **cheapest-first** across all sellers (`orderBy: price asc`). The catalog
  cards' quick-add omits them.

## `releaseCartItems` / `clearCart`

Reset `reservedBy`/`reservedUntil` (per product or for the entire cart).

## UI

`/cart` (`src/app/(account)/cart/page.tsx`) is a thin server component that renders the client
component `CartDetail` (`src/components/cart-detail.tsx`). The building blocks it shares with the
header's cart sheet — `useCountdown`, `ReservationStatus`, `CartProductRow`, `SummaryLine` — live in
`src/components/cart-items.tsx`. All logic lives in `CartDetail`: `useCart` (`GET
/api/cart`) feeds a `match()` over the query with a row-shaped skeleton (pending), an error line, a
dashed-border empty state (CTA to `/products`) and the populated view. Layout mirrors the stocks page
(`max-w-5xl` container, eyebrow + H1 + description, one `Card` with a `divide-y` list of products).

- **Rows.** Product name, a "N keys" badge, the product subtotal (`Satoshi` icon + sr-only " sats") and a
  remove button. A single tier is shown inline (`quantity × price (seller)` and line total); several
  tiers go inside an `Accordion` ("Breakdown per stock"). Removal asks for confirmation in an
  `AlertDialog` and then calls `useRemoveFromCart` (`DELETE /api/cart/remove`); the pending state is
  scoped to the row being removed (`mutation.variables.productId`).
- **Reservation countdown.** `useCountdown(earliestExpiry)` (colocated in `cart-detail.tsx`) ticks every
  second and returns the remaining seconds. `ReservationStatus` is a `role="status"` + `aria-atomic`
  block with a fixed minimum height and three tiers: active (positive, until 2 minutes are left),
  warning (under 120 s) and expired (negative, "your items are no longer reserved"). When it reaches
  zero, "Continue to checkout" is disabled.
- **Summary.** A `dl` with items subtotal, platform fee estimate (`PLATFORM_FEE_PERCENT` of the subtotal,
  rounded up; labelled as an estimate) and estimated total. The exact per-order fee (which also
  includes the dust threshold) is computed at checkout, see [orders.md](./orders.md).
- **Checkout.** The header holds "Continue to checkout" (primary) and "Browse more". The primary opens
  `CheckoutDialog` (`src/components/checkout-dialog.tsx`), mounted by `CartDetail` with the `open` state
  it owns. A successful confirmation closes the dialog (the cart is empty by then); an arbiter change
  hands over to `ArbiterChangeDialog`.
- **Cart sheet.** `cart-sheet.tsx` (`CartSheet`, storefront header) opens the same cart as a
  `Sheet` from the right (`w-full`, `sm:max-w-md`). The trigger shows the item count as an
  `aria-hidden` badge (`99+` cap) with the count in its `aria-label`, plus a sibling `sr-only`
  `role="status"` «N items in cart» so an add is announced as a sentence. Inside: header (title +
  item count), the shared `ReservationStatus` countdown and `CartProductRow`s (remove with
  confirmation, tier breakdown), and a footer that sits at the bottom of a short cart and sticks
  there on a long one — items subtotal (fee and exact total are left to checkout), «Review and
  check out» → `/cart` and «Continue shopping» (closes). Links are wrapped in `SheetClose`, since
  `/products` lives in the same layout and would otherwise leave the sheet open. Checkout itself
  stays on the cart page.
