# Orders

Order management as buyer and seller. The **Ark mechanics** (contract, funding, release, dispute,
fees) live in the [escrow/](../escrow.md) tree; here the application path and the checkout. For the
state overview see [lifecycle.md](../lifecycle.md).

| Flow                             | Endpoint                                          | Backend                                         |
| -------------------------------- | ------------------------------------------------- | ----------------------------------------------- |
| Checkout                         | `POST /api/cart/checkout`                         | `processCheckout()` (`mutations-checkout.ts`)   |
| Order list                       | `GET /api/orders?role=buying\|selling`            | `queryOrders()`                                 |
| Order detail                     | `GET /api/orders/[id]`                            | `queryOrderDetail()`                            |
| Escrow funding (live, read-only) | `GET /api/orders/[id]/funding`                    | `readEscrowFunding()` (`query-orders.ts`)       |
| Verify funding ¹                 | `POST /api/orders/[id]/verify-funding`            | `verifyEscrowFunding()` (`mutations-orders.ts`) |
| Confirm (seller) ¹               | `POST /api/orders/[id]/confirm`                   | `confirmOrder()`                                |
| Prepare release (seller)         | `POST /api/orders/[id]/release/prepare`           | `prepareRelease()`                              |
| Collaborate (buyer)              | `POST /api/orders/[id]/release/collaborate`       | `collaborateRelease()`                          |
| Cash out (seller)                | `POST /api/orders/[id]/release/finalize`          | `finalizeRelease()`                             |
| Open dispute (both)              | `POST /api/orders/[id]/dispute`                   | `openDispute()`                                 |
| Settle dispute (favoured party)  | `POST /api/orders/[id]/settle/{prepare,finalize}` | see [escrow/dispute.md](../escrow/dispute.md)   |

> ¹ Mutations signed with `verifySignedJsonBody` (like all the other POST/PATCH/DELETE): the client
> sends a body with `signature`/`_sigTs`/`_sigNonce`; without a valid signature the server responds 401.

> The mechanics of `funding`/`verify-funding`/`confirm`/`release/*` are in
> [escrow/release.md](../escrow/release.md); `dispute`/`settle/*` in
> [escrow/dispute.md](../escrow/dispute.md). Below, only the checkout (order + escrow creation) and the
> payment.

## List pages — `(account)/orders/{buying,selling}`

The two pages are **thin server components** (`H1` title "My purchases" / "My sales") that mount the
same shared client component `src/components/orders-list.tsx` with `role="buyer"` or `role="seller"`.
`OrdersList` owns the page state (`useQueryStates`), `useOrders({ role, page })`, the react-query
`match()`, the skeleton, the parametric empty state (icon/CTA per role) and the pagination.

The listing is a **list of cards** (not a table): each order is a full-width card, clickable toward
`/orders/[id]`. Row 1: `#id` + name of the first product + `+N` badge (extra items) + **status** badge
(`ORDER_STATUS_LABELS`/`ORDER_STATUS_BADGE`). Row 2: counterparty (`Seller`/`Buyer` according to the
role) + **total** in sats (`formatPrice`) + **date of last activity**.

**Sorting by last activity.** `queryOrders`'s default sort is `lastActivity` desc (most recent on
top). There is no `updatedAt` column: `lastActivityAt` is derived as
`MAX(createdAt, completedAt, concludedAt)` (a field added to `OrderListRow`). Since it is not a DB
column, for `sort=lastActivity` `queryOrders` sorts **application-side** (fetch of id+timestamp of all
the user's orders → sort → slice of the page → hydrate the rows); the other sorts
(`createdAt`/`totalSats`/`status`) stay on the Prisma `skip/take` path. **Known limitation:** the
transitions to `disputed`/`cancelled` have no dedicated timestamp, so those orders do not rise to the
top. `queryOrdersAsAdmin` (admin list) is unaffected and keeps the `createdAt` default.

## Order detail page — `(account)/orders/[id]`

The page is a **thin server component**: it does `parseInt(params.id)` (→ `notFound()` if NaN) and
mounts `<OrderDetail orderId={id} />` (`src/components/order-detail.tsx`). All the logic lives in the
dedicated client components; the orchestrator owns `useOrderDetail` + `useEscrowFunding`, the
**auto-verify funding** effect (verifies the funding as soon as polling reports it `funded`) and the
`match()` on the react-query state.

**Two-column layout** (`lg:grid-cols-[minmax(280px,1fr)_4fr]`): a narrow left column (actions +
stepper) and a wide right column (the order content). Header with only the "Back" link.

- Left column (narrow, `lg:sticky`): at the top `OrderActionsPanel` — order + escrow status badge,
  `EscrowFundingBar`, copyable escrow address and **all** the state-machine actions (verify payment,
  confirm/prepare/collaborate/cash-out release, **open dispute**, settle/complete dispute, disabled CSV
  stub); the escrow/dispute mutations are instantiated internally to the panel. Just below,
  `OrderStepper` (a **vertical** lifecycle stepper, shared, props unchanged). On **mobile** the left
  column (actions + stepper) stacks on top so the action is reachable without scrolling.
- Right column (wide): `OrderSummaryCard` (counterparty with copyable pubkey,
  creation/completion/conclusion dates) → `OrderProductsTable` (items with a link to the product,
  price, **key** column with reveal; subtotal/fee/total footer) → `OrderDisputePanel`.
- `OrderDisputePanel` (at the bottom of the right column), **informational only** and visible only if
  `order.chatId != null` **or** `canOpenDispute(...)`: outcome badge (`CONCLUSION_STATUS_*`), refund
  breakdown (buyer refund, fee, admin dispute share, seller share), per-item outcome
  (Refunded/Not refunded) and **inline chat** (`OrderChatThread`, buyer ↔ seller ↔ admin). No
  settlement action here.

**Key reveal**: `code` arrives populated only for those entitled to it (server logic in
`queryOrderDetail`); the UI reflects only `code`. `null` → `—`; otherwise masked (`••••••••`) with a
"Show/Hide" toggle and a copy button, local state per row.

## Checkout — `processCheckout()`

Before the transaction, the route (`src/app/api/cart/checkout/route.ts`) resolves the escrow's inputs
(Arkade operator, admin pubkey, `exitDelay`) — detail in [escrow/contract.md](../escrow/contract.md).
Everything else in a **DB transaction**:

1. Loads the requested `Key`s (`keyIds`) with the seller.
2. Filters availability; each discarded key is marked with a reason: `not_found`, `own_key` (the
   buyer's own key), `already_sold` (`orderId` set), `reserved_by_other`, `reservation_expired`.
3. Groups the available keys by `sellerPubkey` → **creates a separate `Order` for each seller**
   (`status: pending`, `totalSats` = sum of prices).
4. Attaches the keys to the order (`orderId`) and clears the reservation.
5. **For each order, creates the Arkade-OS escrow**: derives the address with `deriveEscrowAddress()`,
   creates the order's `Chat` (reusing the checkout signature as `Chat.signature`), creates the
   `Escrow` row (`status: awaitingFunds`, `serverPubkey` = operator, `arbiterPubkey` = admin,
   `price` = `totalSats + platformFee`, `exitDelay`, `nonce`), and sets `Order.escrowAddress`.
6. Response `{ orders, unavailableKeys }`; each order includes an `escrow` descriptor (`address`,
   `sellerPubkey`, `arbiterPubkey`, `serverPubkey`, `exitDelay`, `nonce`, `price`). If no key is
   available → 409.

The platform fee (1% surcharge on the buyer) is detailed in [escrow/fees.md](../escrow/fees.md).

> ⚠️ **Race condition**: Prisma does not expose `SELECT ... FOR UPDATE`; serialization is best-effort
> (see the comment in `mutations-checkout.ts`).

## Payment (with confirmation)

The `CheckoutDialog` shows the **verified** escrow addresses (see client-side verification in
[escrow/contract.md](../escrow/contract.md)) and a **"Pay now"** button that, via `usePayEscrows`
(`src/hooks/cart.ts`), sends from the buyer's Arkade wallet the amount to each escrow
(`wallet.send({ address, amount })`). Payments are independent per-order (one failure does not block
the others); the outcome is shown per row.

> At this point the key has `orderId` but **not yet `buyerPubkey`**: ownership passes only at the
> seller's confirmation (see [escrow/release.md](../escrow/release.md)).
