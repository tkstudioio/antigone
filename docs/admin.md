# Domain `(admin)` — Moderation and disputes

Area reserved for the platform admin. The `(admin)` layout gates on `session.user.isAdmin` (see
admin identity in [auth.md](./auth.md)).

## Pages

- `(admin)/disputes` — dispute list as **cards** (only `disputed` and `concluded`; server-side filter in `route.ts`). Each card shows id, status badge, counterparties, total in sats, date. If the order is `concluded` with the escrow still `disputed` (Ark settlement pending), the «Settlement awaiting» badge appears. `DisputeListRow` includes the field `escrowStatus: string | null`.
- `(admin)/disputes/[id]` — dispute detail with a conclusion dialog.
- `(admin)/wallet` — the admin's Arkade wallet (see the Wallet section).

## API and entities

| Component         | Path                                                                                         |
| ----------------- | -------------------------------------------------------------------------------------------- |
| Dispute list      | `src/app/api/admin/disputes/route.ts` → `queryDisputes()` (only `disputed`+`concluded`)      |
| Dispute detail    | `src/app/api/admin/disputes/[id]/route.ts` → `queryOrderDetailAsAdmin()`                     |
| Conclude dispute  | `src/app/api/admin/disputes/[id]/conclude/route.ts` → `concludeOrderAsAdmin()`               |
| Fees config       | `src/app/api/admin/fees/route.ts` — `GET` `{ platformFeePercent, adminDisputeSharePercent }` |
| Chat (admin read) | `src/app/api/admin/chat/[id]/route.ts`                                                       |
| Admin message     | `src/app/api/chat/[id]/admin-message/route.ts`                                               |
| Backend           | `src/lib/backend/mutations-orders.ts`, `query-orders.ts`                                     |

## Gating

- **Disputes**: use `requireAdminRoute()` (`src/lib/auth/session.ts`).
- **Admin chat**: uses `requireSessionRoute()` + a manual check `session.user.isAdmin !== true` → 403.
- **Dispute gate** (`src/lib/backend/dispute-access.ts`): the admin is the escrow's third party **only
  during a dispute**. **Writes** (admin message, attachment upload) require an active dispute
  (`isDisputeStatus()` → `disputed`/`concluded`); **reads** (chat history, attachment download,
  key codes) also allow the orders the admin has **judged** after the settlement
  (`mayAdminReadOrder()` → active dispute **or** `conclusionStatus != null`). Happy-path orders
  (never disputed) are never readable; outside the gate the admin receives 403 on
  chat/attachments and `code: null` on keys.

## Dispute conclusion — `POST /api/admin/disputes/[id]/conclude`

**Verdict overridable until the Ark settlement.** The conclusion is **not one-shot**:
as long as the escrow stays `disputed` (funded case, Ark settlement pending) the admin can
re-conclude — typically to **change the favoured party** and release the funds when the favoured
party does not drive the settlement. The block (`409 "Dispute already settled, not modifiable"`) only
triggers when the escrow is **terminal** (`completed`/`refunded`/`expiredSwept`), or — if there is no
escrow to settle — when the order is already `concluded`. The UI reflects this: the CTA stays
enabled and labeled «Update verdict» while the order is `concluded` but the escrow is still
`disputed`.

**Amount and outcome derived from the keys.** In the dialog the admin checks only the **items to
refund**: `refundAmount` = sum of the prices of the checked keys, `conclusionStatus` derived via
`deriveConclusionStatus()` (`src/lib/orders-status.ts`): 0 → `completed`, all → `cancelled`, some
→ `partially_refunded`. The **favoured party** has a derived default (refund > 50% of the total →
`buyer`, otherwise `seller`) but is **overridable** manually. The backend **re-derives and validates**
`refundAmount` and `conclusionStatus` against the submitted keys (422 if inconsistent); `favouredRole` remains
the admin's signed choice.

1. `requireAdminRoute()`.
2. **Admin pubkey derived at runtime** from `ADMIN_MNEMONIC` + `ADMIN_PASSPHRASE`; if absent/invalid → 403.
3. Body signed **with the admin key**, validated with `concludeDisputeSchema`; the body's `orderId`
   must match the URL.
4. `concludeOrderAsAdmin()`:
   - **Immutability guard**: reads the escrow status; blocks with 409 if terminal
     (`completed`/`refunded`/`expiredSwept`) or, without an escrow, if the order is already `concluded`. Otherwise
     it proceeds even on an already `concluded` order (override).
   - Checks whether the escrow is funded (`getEscrowFunding` against `totalSats + platformFee`).
   - **Validates consistency**: `refundAmount` must equal the sum of the prices of the `refundedKeyIds`
     and `conclusionStatus` must match `deriveConclusionStatus()` (422 otherwise).
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

## Chat moderation

The E2E mechanics (why the admin does not read by default, `grant-admin`, wrapping of post-dispute
messages) are in [crypto/messaging.md](./crypto/messaging.md); attachment encryption/storage in
[crypto/at-rest.md](./crypto/at-rest.md). Endpoints:

- `GET /api/admin/chat/[id]` — the admin reads the chat if the order is in dispute **or if they judged it**
  (`mayAdminReadOrder`, otherwise 403); returns ciphertext + the admin's `MessageKey`
  (populated only after `grant-admin`); the messages include `attachment` (name, type, size, URL).
- `POST /api/chat/[id]/admin-message` — the admin writes (only during a dispute, 403 otherwise);
  accepts `{ ciphertext?, keys?, attachment?, signature }`; text E2E-encrypted toward buyer + seller +
  admin; **signed with the admin key** and verified server-side; 409 if chat `closed`.
- `POST /api/chat/[id]/attachment` — attachment upload (images, max 5 MB); authorized for
  buyer/seller always, for the admin **only during a dispute**; 409 if chat `closed`.
- `GET /api/chat/[id]/attachment/[messageId]` — proxied/decrypted download; authorized for the
  participants always, for the admin if the order is in dispute **or if they judged it**; 404 if the
  message has no attachment.

### Dispute detail layout

`AdminDisputeDetail` uses a **two-column** layout (`grid lg:grid-cols-4`, 1fr / 3fr):

- **Left (1fr)**: "Order summary" card (status, total, **escrow funds bar**
  `EscrowFundingBar` read-only, **Dispute outcome** block when `concluded`, and the **CTA**
  «Conclude»/«Update verdict») followed by the **lifecycle stepper** (`OrderStepper`,
  shared with the order detail, `role` undefined for the admin).
- **Right (3fr)**: "Counterparties" card (seller/buyer tiles + metadata), "Items" card, "Conversation"
  card with `<AdminChatThread chatId={order.chatId} />` inline when `order.chatId != null`.

The thread shows all messages (buyer, seller, admin) with clickable thumbnails; the
composer includes "Attach image" with preview and removal (usable as long as the chat is open,
i.e. as long as the escrow is not settled). The dispute list (`useAdminChats`) polls every 15s and the
admin chat (`useAdminChat`) every 10s while it is open.

## Wallet

The `(admin)/wallet` page. It reuses the shared component `src/components/wallet-overview.tsx` (the same
as [account.md](./account.md)): balance, send/receive, history. It is **entirely client-side** and
account-agnostic — it reads from the global stores/hooks (`useProfileStore`, `useWalletBalance`/
`useWalletTransactions`/`useSendPayment`). Since the admin logs in with the same identity used for the
escrow arbiter pubkey (`ADMIN_MNEMONIC` + `ADMIN_PASSPHRASE`), this wallet **is** the arbiter's
wallet: the arbitration earnings (`adminDisputeShare`) land here. No dedicated application API: the
wallet rehydration is global (`WalletAutoReconnect` in `src/providers/index.tsx`).

## Notes / technical debt

- **Collaborative settlement (Stage 1) implemented:** the dispute conclusion on a funded escrow
  leaves the escrow in `disputed`; the favoured party drives the Ark settle via leaf 1/2. The admin
  signature happens server-side during `prepare`. As long as the escrow is `disputed` the verdict is
  **overridable** (re-conclusion, e.g. to change the favoured party and release the funds); the
  verdict is fixed only when the escrow becomes terminal.
- **CSV exit (Stage 2) remaining:** the "Exit unilaterally (CSV)" button is disabled, the endpoint
  `/settle/exit` responds 501. It requires an on-chain provider + funds for the mining fee.
