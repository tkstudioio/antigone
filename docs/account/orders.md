# Orders

Order management as buyer and seller. The **Ark mechanics** (contract, funding, release, dispute,
fees) live in the [escrow/](../escrow.md) tree; here the application path and the checkout. For the
state overview see [lifecycle.md](../lifecycle.md).

| Flow                                                | Endpoint                                          | Backend                                                                                                                                                                    |
| --------------------------------------------------- | ------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Checkout                                            | `POST /api/cart/checkout`                         | `processCheckout()` (`mutations-checkout.ts`)                                                                                                                              |
| Order list                                          | `GET /api/orders?role=buying\|selling`            | `queryOrders()`                                                                                                                                                            |
| Order detail                                        | `GET /api/orders/[id]`                            | `queryOrderDetail()`                                                                                                                                                       |
| Escrow funding (live, read-only) ²                  | `GET /api/orders/[id]/funding`                    | `readEscrowFunding()` (`query-orders.ts`) — **not used by the UI**                                                                                                         |
| Verify funding ¹                                    | `POST /api/orders/[id]/verify-funding`            | `verifyEscrowFunding()` (`mutations-orders.ts`)                                                                                                                            |
| Confirm = deliver keys (seller) ¹                   | `POST /api/orders/[id]/confirm`                   | `confirmOrder()` — body `{ keys: [{ keyId, wrappedCek }] }`                                                                                                                |
| Deliver keys in a dispute (seller) ¹                | `POST /api/orders/[id]/deliver`                   | `deliverOrderKeys()` (pending/disputed, no status change)                                                                                                                  |
| Share keys with the arbiter (party) ¹               | `POST /api/orders/[id]/grant-arbiter-keys`        | `grantArbiterKeys()` (dispute only)                                                                                                                                        |
| Prepare release (seller)                            | `POST /api/orders/[id]/release/prepare`           | `prepareRelease()`                                                                                                                                                         |
| Collaborate (buyer)                                 | `POST /api/orders/[id]/release/collaborate`       | `collaborateRelease()`                                                                                                                                                     |
| Cash out (seller)                                   | `POST /api/orders/[id]/release/finalize`          | `finalizeRelease()`                                                                                                                                                        |
| Cancel unpaid order (buyer; seller after the TTL) ¹ | `POST /api/orders/[id]/cancel`                    | `cancelUnpaidOrder()` (`mutations-order-expiry.ts`) behind the route's indexer funding gate                                                                                |
| Expire unpaid orders (cron)                         | `GET /api/internal/expire-orders`                 | `sweepExpiredOrders()` (`mutations-order-expiry.ts`) — `Authorization: Bearer $CRON_SECRET`, not signed                                                                    |
| Open dispute (both)                                 | `POST /api/orders/[id]/dispute`                   | `openDispute()`                                                                                                                                                            |
| Settle dispute (favoured party)                     | `POST /api/orders/[id]/settle/{prepare,finalize}` | `prepareDisputeSettlement()` / `finalizeDisputeSettlement()` — the arbiter's step is `POST /api/admin/disputes/[id]/cosign`, see [escrow/dispute.md](../escrow/dispute.md) |

> ¹ Mutations wrapped in `signedRoute` (like all the other POST/PATCH/DELETE): the client sends the
> `x-antigone-signature`/`-timestamp`/`-nonce` headers over the body hash; without a valid signature the
> server responds 401 (see [crypto/signing.md](../crypto/signing.md)).

> ² The funding bar reads the escrow's funds from the **Ark indexer in the browser**, not from this
> endpoint (kept for tooling). See [crypto/verification.md](../crypto/verification.md).

> The mechanics of `funding`/`verify-funding`/`confirm`/`release/*` are in
> [escrow/release.md](../escrow/release.md); `dispute`/`settle/*` in
> [escrow/dispute.md](../escrow/dispute.md). Below, only the checkout (order + escrow creation) and the
> payment.

## List pages — `(account)/orders/{buying,selling}`

The two pages are **thin server components** that only mount the shared client component
`src/components/orders-list.tsx` with `role="buyer"` or `role="seller"`. The header (eyebrow, `H1`,
description) lives in the client module, because the role copy carries lucide icon components that
cannot cross the server/client boundary.

**Role config.** `ORDERS_LIST_CONFIG: Record<OrderRole, OrdersListConfig>` holds all role-specific
content: `eyebrow`, `title`, `description`, `counterpartyLabel` (`Seller`/`Buyer`), `searchLabel` and
`empty: { icon, title, description, ctaLabel, ctaHref }` and an optional
`headerAction: { label, href, icon }`. `OrdersList` never branches on the role, so each role is tuned
by editing its entry only.

**Header action.** Like `(account)/stocks`, the header pairs the title block with a primary `Button`
(`w-full` on mobile, `sm:w-auto`, right-aligned): buyers get «Browse products» (`/products`), sellers
get «Manage stock» (`/stocks`), so each page has a path to its counterpart area besides the sidebar.

**Seller copy.** The selling page uses eyebrow `Seller`, title `Sales` (the sidebar label) and a
description about orders buyers placed on the seller's stock. Search is labelled «Search buyer
username». Its empty state cannot tell «no stock listed» from «no buyers yet», so it only says orders
on the seller's stock will appear here and points to `/stocks` («Manage your stock»).

**Layout (same house style as `(account)/stocks`).** Container `max-w-5xl space-y-8 pb-16`; header;
toolbar; a result count (`N orders`); then one `Card` wrapping a `<ul className="divide-y">` of rows.
Each row is a single `Link` to `/orders/[id]` with hover, inset `focus-visible` ring and a
`ChevronRight` that nudges on hover. State lives in a single `useQueryStates` call
(`page`, `sort`, `dir`, `search`); every filter change resets `page` to 1.

**Toolbar.** An `InputGroup` search (debounced with `useDebounceValue`, compared as
`debouncedInput === query.search`, with an inline clear button), a `SegmentedControl` sort pairing
`sort` + `dir` (Recent = `lastActivity` desc, Amount = `totalSats` desc, Status = `status` asc) and a
`Clear` button shown when anything differs from the defaults. `search` matches the **counterparty
username only** (seller for buyers, buyer for sellers) and is labelled that way. There is **no status
filter** server-side, so none is offered.

**Row anatomy.** Left: `#id` (mono), first product name (truncated), a `+N` badge for extra items
(with an `sr-only` "and N more items"), and the counterparty (`Seller: …`/`Buyer: …`). Middle: a `dl`
with `Total` (`Satoshi` icon + `formatPrice`, `sr-only` " sats") and `Last activity` (a `<time>` with
the absolute date, full date-time in `title`). Right: the status `Badge`
(`ORDER_STATUS_LABELS`/`ORDER_STATUS_BADGE`), always in the same column.

**States.** Loading: a row-shaped skeleton inside the same `Card`/`divide-y` (`aria-busy`,
`aria-label="Loading orders"`). Empty: a dashed-border block with a `size-10` icon tile, a
`font-semibold` title (not a heading — the page has a single `H1`), a one-line explanation and the
role CTA; with an active search it reads "No orders found" without a CTA. Pagination: a
`nav aria-label="Pagination"` with Previous/Next chevrons and `Page X of Y`
(`totalPages = Math.max(1, Math.ceil(total / pageSize))`), shown only when there is more than one page.
The list still refetches every 15s through `useOrders`.

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
  confirm/prepare/collaborate/cash-out release, **open dispute**, prepare/complete dispute settlement, disabled CSV
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

**Verification of what the server returns.** `GET /api/orders/[id]` also returns the signed actions
behind the order (`checkoutAction`, `confirmAction`, `disputeAction`, `verdictAction`).
`useOrderDetail` → `loadOrderView` (`src/hooks/orders.ts`) verifies them in the browser
(`verifyOrderDetail`, `src/lib/order-verification.ts`) and attaches `order.verification`: the
buyer-signed terms (keys, sellers, prices, total, escrow params and the locally re-derived escrow
address), the seller's confirmation/delivery, the dispute opening and the arbiter's verdict, plus the
operator key (`getInfo()` in the browser) and the arbiter pin (TOFU). `OrderVerificationBanner` shows
what failed, `OrderSummaryCard` and `OrderDisputePanel` show per-step "signature verified" badges, and
when anything is `tampered` (or the operator/arbiter check fails) **every signing, paying and
settling action is disabled** — `OrderActionsPanel` disables the buttons and each mutation calls
`assertOrderActionable`. A changed arbiter opens `ArbiterChangeDialog`. Legacy orders (no linked action)
show "Unverified (legacy)" and stay actionable. Full rules in
[crypto/verification.md](../crypto/verification.md).

**Key reveal**: codes are E2E-encrypted, so the server returns per item `{ ciphertext, wrappedCek,
wrapperPubkey, delivered }` — populated only for those entitled to it (server logic in
`queryOrderDetail`: seller always; buyer only once the key is assigned to them) — and `useOrderDetail`
decrypts in the browser (`decryptOrderItems` → `code` + `codeStatus`). Nothing to open → `—`; a wrap
that does not open → «Unable to decrypt — open a dispute»; otherwise masked (`••••••••`) with a
"Show/Hide" toggle and a copy button, local state per row.

**Funding bar.** `EscrowFundingBar` (in `OrderActionsPanel`) is fed by `useEscrowFunding`, which queries
the Ark **indexer** from the browser (script re-derived from the escrow params, polled every 8 s while
awaiting funds and every 60 s while locked). If the indexer is unreachable it shows «Ark indexer
unavailable» and the **Pay** button stays disabled (the amount still due depends on the locked total).
Before paying, the panel also checks that the operator key equals the operator's own and that the escrow
address re-derives from its params.

**Delivery.** The seller's confirmation **is** the delivery of the keys: `useConfirmAndPrepareRelease`
unwraps the CEK of every order key and re-wraps it toward the buyer (`rewrapCekForRecipient`), sending
`{ keys: [{ keyId, wrappedCek }] }`. `confirmOrder` requires **exactly one wrap per order key, all for
the buyer** (missing/extra/foreign key → 422, nothing stored), stores them as `KeyCodeKey` rows and then
performs the transition (`buyerPubkey` on the keys, order `completed`) in one transaction; the escrow
must still be `fundLocked` (409 otherwise). A locked wallet blocks it («Wallet unavailable»).

**Dispute and codes.** `useOpenDispute` additionally calls `POST /api/orders/[id]/grant-arbiter-keys`
after the chat `grant-admin` step: the party re-wraps toward the escrow arbiter (`ADMIN_PUBKEY`) the CEKs
of every key it can open (seller: all; buyer: the delivered ones). The endpoint is dispute-only
(403 otherwise, also for non-parties), resolves the recipient from the escrow (never from the client),
requires each key to belong to the order and the caller to hold its own wrap (422), and can be called
again while the order is in dispute. If the dispute was opened **before** confirmation the keys were
never delivered: `OrderActionsPanel` offers the seller «Deliver keys» (`useDeliverKeys` →
`POST /api/orders/[id]/deliver`, same payload as confirm, no status change, then a grant to the
arbiter) so the verdict can let the buyer keep them. The buyer still sees the codes only after the
verdict assigns the keys to them. `concludeOrderAsAdmin` rejects retaining an undelivered key (see
[admin.md](../admin.md)).

## Checkout — `processCheckout()`

Before the transaction, the route (`src/app/api/cart/checkout/route.ts`) resolves the escrow's inputs
(Arkade operator, admin pubkey, `exitDelay`) — detail in [escrow/contract.md](../escrow/contract.md).
Everything else in a **DB transaction**:

1. Loads the requested `Key`s (the `items` of the payload) that are still sellable
   (`orderId = null`) and reserved by the buyer with a live reservation (`reservedUntil >= now`, one
   `now` captured at the start of the transaction). The payload is the **buyer-signed terms** —
   `items: [{ keyId, sellerPubkey, price }]`, exactly what the cart showed. If a loaded key's price
   or seller differs from its signed item the whole checkout is rejected with **409** (the client
   refetches the cart so the user re-confirms the new price).
2. **All-or-nothing availability.** If any requested key was not loaded the whole checkout is
   aborted with **409** and the body carries `unavailableKeys: [{ keyId, reason }]`, where `reason`
   is one of `not_found`, `already_sold` (`orderId` set), `reserved_by_other` (reserved by someone
   else) or `reservation_expired` (no live reservation of the buyer). One extra query classifies the
   missing keys. Nothing is created for the keys that were available.
3. **Cap on open unpaid orders.** Counts the buyer's `pending` orders whose escrow is
   `awaitingFunds`/`partiallyFunded`; if this request would push it above
   `MAX_PENDING_ORDERS_PER_ACCOUNT` (default 10) → **409**, nothing created.
4. Groups the keys by `sellerPubkey` → **creates a separate `Order` for each seller**
   (`status: pending`, `totalSats` = sum of prices, `checkoutActionId` = the signed checkout, shared by
   all the orders of the request).
5. Attaches each group's keys to its order with a **conditional** `updateMany`
   (`orderId = null`, `reservedBy = buyer`, `reservedUntil >= now`) and asserts that the update count
   equals the group size; clears the reservation.
6. **For each order, creates the Arkade-OS escrow**: derives the address with `deriveEscrowAddress()`,
   creates the order's `Chat` (reusing the checkout signature as `Chat.signature`), creates the
   `Escrow` row (`status: awaitingFunds`, `serverPubkey` = operator, `arbiterPubkey` = admin,
   `price` = `totalSats + platformFee`, `exitDelay`, `nonce`), and sets `Order.escrowAddress`.
7. Response `{ orders }`; each order includes an `escrow` descriptor (`address`, `sellerPubkey`,
   `arbiterPubkey`, `serverPubkey`, `exitDelay`, `nonce`, `price`).

The platform fee (1% surcharge on the buyer) is detailed in [escrow/fees.md](../escrow/fees.md).

After the response, `useCheckout` verifies it **before any funds can be sent**: every order's keys,
seller and total must match what was signed, `escrow.price = total + platformFee`, each escrow address
re-derives locally, the operator key equals the operator's own `getInfo()` (browser), and the arbiter is
checked against the TOFU pin (a different arbiter blocks payment and opens the warning dialog). The
signed checkout body lists all the buyer's items, so each seller receives the buyer's full signed terms
(see the privacy note in [crypto/verification.md](../crypto/verification.md)).

**Guarantee: a key is sold at most once, and a checkout is atomic.** Two concurrent checkouts can
never both claim the same key: every claim is a conditional `UPDATE` that repeats the availability
filter, and its row count is asserted. In PostgreSQL `READ COMMITTED` an `UPDATE` that blocks on a row
re-evaluates its `WHERE` clause against the updated row once the lock is released, so a key already
claimed by a concurrent committed checkout no longer matches and the count falls short. Any shortfall
throws inside the transaction and **rolls back the entire request** — no partial orders and no
orphan escrow — answered with **409** and `unavailableKeys`. No `FOR UPDATE` and no `Serializable`
isolation are needed.

## Unpaid order expiry

An order whose escrow is still `awaitingFunds`/`partiallyFunded` after
`ORDER_PAYMENT_TTL_MINUTES` (default **45**) from its `createdAt` can be cancelled, which puts its
keys back on sale. `queryOrderDetail` exposes the deadline as `paymentExpiresAt` (ISO string,
`createdAt` + TTL), non-null **only** while the order is `pending` and the escrow is
`awaitingFunds`/`partiallyFunded`, `null` otherwise.

**The funding gate (critical).** The `awaitingFunds -> fundLocked` promotion is client-driven
(`verifyEscrowFunding` is only called from the buyer's browser), so an order in `awaitingFunds`
**may already be paid on Ark**. Nothing is ever cancelled without asking the Ark indexer first
(`getEscrowFunding`, server-side, never inside a DB transaction):

| Indexer reading                | Sweeper                                                      | Manual cancel route |
| ------------------------------ | ------------------------------------------------------------ | ------------------- |
| Funded (`total >= price`)      | **Promotes** the escrow to `fundLocked` (conditional update) | 409                 |
| Partially funded (`0 < total`) | Touches nothing, counts `skipped`, logs: a human must look   | 409                 |
| Nothing locked (`total === 0`) | **Cancels** the order                                        | Cancels the order   |
| Indexer unreachable            | Fail closed: skips, counts `errors`, retried on the next run | 503                 |

**Cancellation** (`cancelUnpaidOrder()`): one transaction, every write conditional. The order moves
`pending -> cancelled` (`updateMany` on `status: pending`; if someone else moved it first → 409, no
side effects), its keys get `orderId`/`reservedBy`/`reservedUntil` cleared (back on sale), and the
order chat is closed with an English system message saying the order was cancelled automatically / by
the buyer / by the seller because the payment was not received. The escrow is deliberately **left in
`awaitingFunds`**: no new escrow status exists, the dead escrow is identified by its order being
`cancelled`. Two guards stop a late payment from reviving it: `verifyEscrowFunding` never promotes the
escrow of a `cancelled` order, and `confirmOrder` rejects it with 409 ("Order cancelled").

**Who can cancel** (`POST /api/orders/[id]/cancel`, signed, body `{ orderId }` must equal the URL id →
400 otherwise): the **buyer** at any time while the escrow is unfunded; the **seller** only once the
TTL has elapsed (403 before); a non-party gets 403; a non-`pending` order or an already-funded escrow
→ 409.

**The sweeper.** `sweepExpiredOrders({ limit = 100 })` selects `pending` orders with an unfunded
escrow older than the TTL (oldest first) and applies the table above. It also counts in `expiringSoon`
(and logs) every queried escrow whose batch expiry is within `EXPIRY_WARNING_WINDOW_MS` (3 days) —
observability only, no state change. It returns `{ scanned, cancelled, promoted, expiringSoon,
skipped, errors }`. It runs once a day (03:00 UTC — the Hobby plan only allows daily crons) from Vercel Cron (`vercel.json` →
`GET /api/internal/expire-orders`) and manually with `pnpm orders:expire`. The route is deliberately a
**GET** (Vercel Cron only issues GETs, and a GET stays outside the signed-mutation gate of
`src/proxy.ts`); it authenticates with `Authorization: Bearer $CRON_SECRET` (constant-time compare;
401 on mismatch, 500 if `CRON_SECRET` is unset — it never runs unauthenticated).

**Per-account caps.** `MAX_RESERVED_KEYS_PER_ACCOUNT` (default 50, enforced in `reserveKeys`, see
[cart.md](./cart.md)) and `MAX_PENDING_ORDERS_PER_ACCOUNT` (default 10, enforced at checkout). Those
two and `ORDER_PAYMENT_TTL_MINUTES` live together in `src/lib/backend/limits.ts`, the anti-abuse
limits of the buying flow: each is read defensively from env and an absent or invalid value falls
back to the default.

**UI.** The order detail shows the buyer the payment deadline and a **"Cancel order"** action next to
**"Pay"** while the order is awaiting payment; the seller gets the same action once the TTL has
elapsed. Open dispute is now one shared **"Open dispute"** affordance driven by `canOpenDispute()`
(`src/lib/escrow-status.ts`, the same predicate `OrderDisputePanel` uses), so the buyer can open a
dispute also while the escrow is `sellerReady` — i.e. right after the keys are delivered, which is
when an invalid code is discovered. Like every other action it stays visible but disabled while the
order fails verification.

## Payment (with confirmation)

The `CheckoutDialog` shows the **verified** escrow addresses (see client-side verification in
[escrow/contract.md](../escrow/contract.md)) and a **"Pay now"** button that, via `usePayEscrows`
(`src/hooks/cart.ts`), sends from the buyer's Arkade wallet the amount to each escrow
(`wallet.send({ address, amount })`). Payments are independent per-order (one failure does not block
the others); the outcome is shown per row.

> At this point the key has `orderId` but **not yet `buyerPubkey`** (nor a buyer `KeyCodeKey`):
> ownership and delivery happen only at the seller's confirmation (see
> [escrow/release.md](../escrow/release.md)).
