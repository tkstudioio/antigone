# Domain `(admin)` — Moderation, disputes and catalog

Area reserved for the platform admin. The `(admin)` layout gates on `session.user.isAdmin` (see
admin identity in [auth.md](./auth.md)).

## Pages

- `(admin)/disputes` — dispute list as **cards** (only `disputed` and `concluded`; server-side filter in `route.ts`). Each card shows id, status badge, counterparties, total in sats, date. If the order is `concluded` with the escrow still `disputed` (Ark settlement pending), the «Settlement awaiting» badge appears; when the escrow is `settlementPrepared` (the favoured party prepared, the admin must co-sign) the «Co-sign awaiting» badge appears. `DisputeListRow` includes the field `escrowStatus: string | null`.
- `(admin)/disputes/[id]` — dispute detail with a conclusion dialog and the «Co-sign settlement» CTA.
- `(admin)/catalog` — product catalog management: create, edit, archive/restore and delete products
  (see the Catalog section).
- `(admin)/wallet` — the admin's Arkade wallet (see the Wallet section).

## API and entities

| Component          | Path                                                                                                            |
| ------------------ | --------------------------------------------------------------------------------------------------------------- |
| Dispute list       | `src/app/api/admin/disputes/route.ts` → `queryDisputes()` (only `disputed`+`concluded`)                         |
| Dispute detail     | `src/app/api/admin/disputes/[id]/route.ts` → `queryOrderDetailAsAdmin()`                                        |
| Conclude dispute   | `src/app/api/admin/disputes/[id]/conclude/route.ts` → `concludeOrderAsAdmin()`                                  |
| Co-sign settlement | `src/app/api/admin/disputes/[id]/cosign/route.ts` → `cosignDisputeSettlementAsAdmin()` (`mutations-dispute.ts`) |
| Fees config        | `src/app/api/admin/fees/route.ts` — `GET` `{ platformFeePercent, adminDisputeSharePercent }`                    |
| Chat (admin read)  | `src/app/api/admin/chat/[id]/route.ts`                                                                          |
| Admin message      | `src/app/api/chat/[id]/admin-message/route.ts`                                                                  |
| Catalog list       | `GET /api/admin/products` → `queryAdminProducts()` (`query-admin-products.ts`)                                  |
| Create product     | `POST /api/admin/products` → `createProduct()` (`mutations-products.ts`)                                        |
| Update product     | `PATCH /api/admin/products/[id]` → `updateProduct()`                                                            |
| Archive / restore  | `POST /api/admin/products/[id]/archive` → `setProductArchived()`                                                |
| Delete product     | `DELETE /api/admin/products/[id]` → `deleteProduct()` (only without keys)                                       |
| Product image      | `POST /api/admin/products/image` → `putProductObject()` (`src/lib/storage/s3.ts`)                               |
| Backend            | `src/lib/backend/mutations-orders.ts`, `query-orders.ts`, `mutations-products.ts`, `query-admin-products.ts`    |

## Gating

- **Disputes**: use `requireAdminRoute()` (`src/lib/auth/session.ts`). `isAdmin` is true when the
  session pubkey equals `ADMIN_PUBKEY` (see [auth.md](./auth.md)); the same gate applies through the
  `admin` signer of `signedRoute` on `conclude` and `cosign`.
- **Admin chat**: uses `requireSessionRoute()` + a manual check `session.user.isAdmin !== true` → 403.
- **Dispute gate** (`src/lib/backend/dispute-access.ts`): the admin is the escrow's third party **only
  during a dispute**. **Writes** (admin message, attachment upload) require an active dispute
  (`isDisputeStatus()` → `disputed`/`concluded`); **reads** (chat history, attachment download,
  key codes) also allow the orders the admin has **judged** after the settlement
  (`mayAdminReadOrder()` → active dispute **or** `conclusionStatus != null`). Happy-path orders
  (never disputed) are never readable; outside the gate the admin receives 403 on
  chat/attachments and no key ciphertext/wrap on keys. Even inside the gate the admin can decrypt a
  code **only if a dispute party granted it** (`POST /api/orders/[id]/grant-arbiter-keys`, see
  [crypto/at-rest.md](./crypto/at-rest.md)): the dispute detail decrypts in the admin's browser and
  shows «Not shared with the arbiter yet» otherwise.

## Dispute conclusion — `POST /api/admin/disputes/[id]/conclude`

The signed conclude request is linked to the order (`Order.verdictActionId`, the latest verdict) and
returned with the order detail so that buyer, seller and the arbiter itself verify the verdict and build
the settlement from the **signed** fields (see [escrow/dispute.md](./escrow/dispute.md)).

**Verdict overridable until the Ark settlement.** The conclusion is **not one-shot**:
as long as the escrow is `disputed` or `settlementPrepared` (funded case, the arbiter has not
co-signed yet) the admin can re-conclude — typically to **change the favoured party** and release the
funds when the favoured party does not drive the settlement. A re-conclusion in `settlementPrepared`
**discards the stored PSBTs and checkpoints and sets the escrow back to `disputed`** (the favoured
party must prepare again); the update is guarded on the escrow status, so a concurrent co-signature
wins. The block (`409 "Dispute already settled, not modifiable"`) triggers once the escrow is
`settling` (the arbiter co-signed) or **terminal** (`completed`/`refunded`/`expiredSwept`), or — if
there is no escrow to settle — when the order is already `concluded`. The UI reflects this: the CTA
stays enabled and labeled «Update verdict» while the order is `concluded` and the escrow is
`disputed` or `settlementPrepared`.

**Amount and outcome derived from the keys.** In the dialog the admin checks only the **items to
refund**: `refundAmount` = sum of the prices of the checked keys, `conclusionStatus` derived via
`deriveConclusionStatus()` (`src/lib/orders-status.ts`): 0 → `completed`, all → `cancelled`, some
→ `partially_refunded`. The **favoured party** has a derived default (refund > 50% of the total →
`buyer`, otherwise `seller`) but is **overridable** manually. The backend **re-derives and validates**
`refundAmount` and `conclusionStatus` against the submitted keys (422 if inconsistent); `favouredRole` remains
the admin's signed choice.

1. `signedRoute` with the `admin` signer: `requireAdminRoute()` gates first (non-admin → 403), then
   the signed envelope is verified against the admin session's pubkey and persisted as a
   `SignedAction` (see [crypto/signing.md](./crypto/signing.md)); `Order.refundSignature` is filled
   from `action.signature`.
2. Body validated with `concludeDisputeSchema` (no `signature` field); the body's `orderId` must match
   the URL.
3. `concludeOrderAsAdmin()`:
   - **Immutability guard**: reads the escrow status; blocks with 409 if `settling` or terminal
     (`completed`/`refunded`/`expiredSwept`) or, without an escrow, if the order is already `concluded`. Otherwise
     it proceeds even on an already `concluded` order (override); from `settlementPrepared` it also
     clears the stored dispute PSBTs and returns the escrow to `disputed`.
   - Checks whether the escrow is funded (`getEscrowFunding` against `totalSats + platformFee`).
   - **Validates consistency**: `refundAmount` must equal the sum of the prices of the `refundedKeyIds`
     and `conclusionStatus` must match `deriveConclusionStatus()` (422 otherwise).
   - **Refund-only rule**: a key can be _retained_ for the buyer only if it was **delivered** (a buyer
     `KeyCodeKey` exists); retaining an undelivered key → **422**. The dialog marks undelivered keys as
     «Not delivered — refund only» (checked and disabled).
   - Computes the breakdown via `computeDisputeBreakdown` (amount details in
     [escrow/fees.md](./escrow/fees.md)).
   - `Order` → `status: concluded`, saves `refundAmount`, `adminDisputeShare`, `conclusionStatus`
     (`completed` | `partially_refunded` | `cancelled`), `favouredRole` (`buyer` | `seller` — drives the
     Ark settlement / leaf 1 or 2), `refundSignature`, `concludedAt`.
   - **If funded**: `Escrow` stays `disputed` — the verdict is recorded, but the Ark settlement
     awaits the favoured party (see [escrow/dispute.md](./escrow/dispute.md)). The admin **cannot**
     move the funds alone.
   - **If NOT funded**: `Escrow` → `completed` / `refunded` directly (no Ark settlement needed).
   - Applies **both sides** of the selection (so that a re-conclusion correctly flips the
     keys, not only on the first pass): the refunded `Key`s → `refunded: true, buyerPubkey: null`;
     the retained `Key`s → `refunded: false, buyerPubkey = buyer`. Assigning `buyerPubkey` to the
     retained keys is what entitles the buyer to see the decrypted code (the
     visibility in `query-orders` depends on `buyerPubkey`). On a dispute opened before seller
     confirmation this is the only point that sets it — without it, the buyer would see «—».
   - Inserts a **system message** with the full breakdown («Dispute concluded…», or
     «Verdict updated…» on a re-conclusion); if funded it adds "Ark settlement awaiting
     the favoured party."
   - **Chat closure tied to the escrow status**: it closes the chat (`status: closed`) **only** when
     this conclusion is already terminal (escrow not funded → `completed`/`refunded`). If the escrow
     stays `disputed`, the **chat stays open** so parties and admin can communicate during the wait
     for the settlement and any re-conclusions; it is closed later by
     `finalizeDisputeSettlement` (`mutations-dispute.ts`) together with the message "Ark settlement
     completed.".

## Settlement co-signature — `POST /api/admin/disputes/[id]/cosign`

The admin is the escrow's **arbiter** and co-signs the settlement **in their own browser** — the server
has no arbiter key (only `ADMIN_PUBKEY`, see [auth.md](./auth.md)). When the favoured party has
prepared the settlement (escrow `settlementPrepared`), the dispute detail shows a **«Co-sign
settlement»** CTA (`useCosignDisputeSettlement` in `src/hooks/admin.ts`). The admin's browser
validates the stored PSBT independently — escrow address re-derivation, own-key check, VTXOs read from
the Ark indexer, breakdown recomputed from the verdict, shared gates — then signs, calls `submitTx` on
the operator and signs the returned checkpoints. Any failed check aborts with an error toast and
nothing is signed or sent. It then posts `{ disputeArkTxid, serverSignedCheckpoints,
adminSignedCheckpoints }` through `signedRoute` (`admin` signer: non-admin → 403): the server requires
the escrow to be `settlementPrepared` (409 otherwise), the txid to equal the one of the stored favoured
PSBT (422 otherwise), persists, and moves the escrow to `settling`. The favoured party then finalizes.
The three-step mechanics are in [escrow/dispute.md](./escrow/dispute.md). The dispute detail
(`useAdminDisputeDetail`) polls every 10s while the escrow is `disputed`/`settlementPrepared`/`settling`.

## Catalog — `(admin)/catalog`

Products are created and maintained here (`pnpm db:seed` remains only a dev shortcut). The page is a
thin server component rendering `AdminProductsTable` (`src/components/admin-products-table.tsx`):
search on name/slug (debounced), a status `SegmentedControl` (Listed / Archived / All → `status` in
the URL, default `active`), sort (Newest / Name), pagination, and one row per product with its
thumbnail, slug, an «Archived» badge, the key counters (available · sold · total) and an actions menu
(Edit, Archive / List again, Delete). Hooks: `useAdminProducts`, `useSaveProduct`,
`useSetProductArchived`, `useDeleteProduct` in `src/hooks/admin.ts`.

- **Create / edit** (`AdminProductDialog`, `src/components/admin-product-dialog.tsx`): name, slug
  (derived from the name while creating, until edited by hand; `PRODUCT_SLUG_REGEX`), description,
  optional rating 0–5 (it orders the home page's «Top-rated» strip) and image. Fields validated by
  `productFieldsSchema` (`src/validators/index.ts`); a taken slug → **409**, shown on the slug field.
  Changing the slug changes the product URL.
- **Image**: a picked file (JPEG/PNG/WebP/GIF, max 5 MB) is uploaded first as a **signed raw upload**
  (`POST /api/admin/products/image`, `admin` signer) and stored **in clear** under
  `products/<uuid>.<ext>` — product images are public and served by `GET /api/images/[...key]`. The
  returned key becomes `imageUrl` in the create/update payload. The server accepts as `imageUrl`
  only `null`, an uploaded key (`PRODUCT_IMAGE_KEY_REGEX`) or, on update, the product's current
  value unchanged (so seeded external URLs survive an edit) — anything else → **422**. A replaced or
  removed uploaded image is deleted from the bucket best-effort; an upload whose dialog is cancelled
  stays behind as an orphan object.
- **Archive** (`Product.archivedAt`): the product leaves the storefront and stops selling, while
  existing orders and their keys are untouched; «List again» clears it. For an archived product:
  - it is hidden from `queryProducts()` (catalog, home, `GET /api/products` and therefore the
    add-stock picker) and from the sitemap;
  - its detail page stays reachable (links from past orders) with `noindex` and a «No longer
    available» state instead of the sellers list;
  - `reserveKeys` and the checkout no longer match its keys (checkout reason `product_archived`),
    and `POST /api/stocks` refuses new keys (**409**);
  - sellers still see their stock, flagged «Archived · not on sale», and can delete it.
- **Delete**: permanent, allowed **only for a product that never had keys** (`Key.product` cascades,
  so it would wipe sellers' stock and the keys of past orders). The check and the delete are one
  conditional `deleteMany` (`keys: { none: {} }`); otherwise **409** «archive it instead». The menu
  item is disabled when `totalKeys > 0`.

Every catalog mutation is signed with the `admin` signer (`signedRoute`: non-admin → 403) and the
body's `id` must match the URL.

## Chat moderation

The E2E mechanics (why the admin does not read by default, `grant-admin`, wrapping of post-dispute
messages) are in [crypto/messaging.md](./crypto/messaging.md); attachment encryption/storage in
[crypto/at-rest.md](./crypto/at-rest.md). Endpoints:

- `GET /api/admin/chat/[id]` — the admin reads the chat if the order is in dispute **or if they judged it**
  (`mayAdminReadOrder`, otherwise 403); returns ciphertext + the admin's `MessageKey`
  (populated only after `grant-admin`); the messages include `attachment` (name, type, size, URL).
- `POST /api/chat/[id]/admin-message` — the admin writes (only during a dispute, 403 otherwise);
  accepts `{ ciphertext?, keys?, attachment? }`; text E2E-encrypted toward buyer + seller +
  admin; signed via `signedRoute` with the `admin` signer (verified server-side against the admin
  session pubkey; `Message.signature` from `action.signature`); 409 if chat `closed`.
- `POST /api/chat/[id]/attachment?name=…` — **signed** attachment upload (raw body = the image, name in
  the query string; images, max 5 MB); authorized for buyer/seller always, for the admin **only
  during a dispute**; 409 if chat `closed`.
- `GET /api/chat/[id]/attachment/[messageId]` — proxied/decrypted download; authorized for the
  participants always, for the admin if the order is in dispute **or if they judged it**; 404 if the
  message has no attachment.

### Dispute detail layout

`AdminDisputeDetail` uses a **two-column** layout (`grid lg:grid-cols-4`, 1fr / 3fr):

- **Left (1fr)**: "Order summary" card (status, total, **escrow funds bar**
  `EscrowFundingBar` read-only — read from the Ark indexer in the browser —, the per-step signature
  verification badges, **Dispute outcome** block when `concluded`, and the **CTA**
  «Conclude»/«Update verdict», plus «Co-sign settlement» while the escrow is `settlementPrepared`) followed by the **lifecycle stepper** (`OrderStepper`,
  shared with the order detail, `role` undefined for the admin).
- **Right (3fr)**: "Counterparties" card (seller/buyer tiles + metadata), "Items" card, "Conversation"
  card with `<AdminChatThread chatId={order.chatId} parties={…} />` inline when `order.chatId != null`
  (buyer/seller taken from the verified order, the arbiter is the admin's own key).

The page shows an `OrderVerificationBanner` when something failed verification; «Co-sign settlement»
and «Conclude»/«Update verdict» are **disabled** while the order is blocked (tampered terms/verdict,
operator key mismatch, escrow arbiter not the admin's own key). The admin's own verdict is verified
against its own key; the thread verifies every message's signature and the hash chain (see
[crypto/verification.md](./crypto/verification.md)).

The thread shows all messages (buyer, seller, admin) with clickable thumbnails; the
composer includes "Attach image" with preview and removal (usable as long as the chat is open,
i.e. as long as the escrow is not settled). The dispute list (`useAdminChats`) polls every 15s and the
admin chat (`useAdminChat`) every 10s while it is open.

## Wallet

The `(admin)/wallet` page (an «Arbiter» eyebrow, the `Wallet` H1 and a one-line intro, like the account
dashboard). It reuses the shared component `src/components/wallet-overview.tsx` (the same
as [account.md](./account.md)): balance, send/receive, history. It is **entirely client-side** and
account-agnostic — it reads from the global stores/hooks (`useProfileStore`, `useWalletBalance`/
`useWalletTransactions`/`useSendPayment`). Since the admin logs in with the identity whose pubkey is
`ADMIN_PUBKEY` (the escrow arbiter pubkey), this wallet **is** the arbiter's
wallet: the arbitration earnings (`adminDisputeShare`) land here. No dedicated application API: the
wallet rehydration is global (`WalletAutoReconnect` in `src/providers/index.tsx`).

## Notes / technical debt

- **Collaborative settlement (Stage 1) implemented:** the dispute conclusion on a funded escrow
  leaves the escrow in `disputed`; the favoured party drives the Ark settle via leaf 1/2 in three
  steps (prepare → arbiter co-sign → finalize). The arbiter signature is produced **client-side in the
  admin's browser** (the server holds no arbiter key). As long as the escrow is `disputed` or
  `settlementPrepared` the verdict is **overridable** (re-conclusion, e.g. to change the favoured
  party and release the funds); the verdict is fixed once the arbiter co-signs (`settling`).
- **CSV exit (Stage 2) remaining:** the "Exit unilaterally (CSV)" button is disabled, the endpoint
  `/settle/exit` responds 501. It requires an on-chain provider + funds for the mining fee.
