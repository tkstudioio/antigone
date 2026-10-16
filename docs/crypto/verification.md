# Client-side verification of server data

The server is treated as **untrusted**: it may be run by a malicious host, or compromised. Signing every
request ([signing.md](./signing.md)) proves to the _server_ who is asking; this page covers the other
direction — how the _browser_ checks what the server sends back. The rule is simple:

- **User-authored records** (chat messages, the buyer's checkout terms, the seller's confirmation, the
  dispute opening, the arbiter's verdict) are verified against their **author's signature**, and the UI
  reads their values from the **verified signed bytes**, never from parallel server fields.
- **Facts a neutral third party can attest** (escrow funding, expiry, sweep; the operator's key) are read
  by the browser **directly from the Ark indexer / operator**, never relayed by our API.
- **Keys that anchor trust** (operator, arbiter, counterparties) are not taken on the server's word: they
  come from the operator, from a signed record, or are pinned trust-on-first-use.

## The primitive

`src/lib/auth/verify-signed-action.ts` (isomorphic, no server-only import). The API returns the persisted
`SignedAction` behind a record as `{ id, pubkey, method, path, ts, nonce, bodySha256, body, signature }`
(`SignedActionRecord`; server side `toSignedActionRecord` in `src/lib/backend/signed-action-record.ts`).
`verifySignedAction(record, { pubkey, method?, path }, schema?)` accepts it only if **all** hold:

1. the author is one of the **expected** pubkeys (never "whoever the record claims");
2. the method and path match the **expected** endpoint (a signature made for another endpoint is useless);
3. the stored `body` hashes to the signed `bodySha256`;
4. the Schnorr signature over the rebuilt envelope v2 verifies against the author's key.

It returns the **parsed body** (validated with the shared Zod schema, e.g. `checkoutSchema`) or a typed
failure (`wrong-author`, `wrong-path`, `body-hash-mismatch`, `bad-signature`, …). It never throws.

## Domain links

Domain rows reference the action that created or last changed them (nullable FKs to `signed_action`,
filled by the handlers from the `action` that `signedRoute` provides):

| Row          | Column(s)                                                     | Set by                                                 |
| ------------ | ------------------------------------------------------------- | ------------------------------------------------------ |
| `Message`    | `signed_action_id` (unique), `prev_hash`                      | `createMessage` (`message` / `admin-message` routes)   |
| `Order`      | `checkout_action_id`                                          | `processCheckout`                                      |
| `Order`      | `confirm_action_id` (the latest `/confirm` **or** `/deliver`) | `confirmOrder`, `deliverOrderKeys`                     |
| `Order`      | `dispute_action_id`                                           | `openDispute`                                          |
| `Order`      | `verdict_action_id` (the **latest** verdict)                  | `concludeOrderAsAdmin`                                 |
| `KeyCodeKey` | `signed_action_id` (delivery / arbiter grant)                 | `confirmOrder`, `deliverOrderKeys`, `grantArbiterKeys` |

`queryChatDetail`, the admin chat route and `queryOrderDetail[AsAdmin]` include the linked actions in
their payloads (`ChatMessage.action`, `OrderDetail.{checkout,confirm,dispute,verdict}Action`).

## Chat: signatures + hash chain

Every chat message (text **or** attachment) carries its signed action; the signed body includes
**`prevHash`** = `signedActionHash` of the previous message's action in that chat (SHA-256 over the
canonical envelope + the signature), or `chatGenesisHash(chatId)` for the first one
(`src/lib/chat-chain.ts`). System messages are unsigned and are not in the chain.

- **Server**: `createMessage` rejects a send whose `prevHash` is not the current tail with **409**
  (`CHAT_CHAIN_CONFLICT_MESSAGE`); `UNIQUE (chat_id, prev_hash)` makes it race-proof (two concurrent sends
  cannot extend the same tail). The client (`sendOnChain`, `src/hooks/chat.ts`) reads the tail fresh,
  and on a 409 refetches and signs again (up to 3 attempts).
- **Client**: `verifyChatMessages` checks each message's author (must be the order's buyer, seller, or
  the **trusted arbiter** — the pinned one), signature, endpoint (`/api/chat/{id}/message` for parties,
  `/admin-message` for the arbiter), the `chatId` inside the body and the unbroken chain.
  `verifyAndDecryptChat` then decrypts only what verified, rendering from the **signed** `ciphertext`,
  attachment metadata and the viewer's own wrap from the body.

| Message state                          | Rendering                                                                           |
| -------------------------------------- | ----------------------------------------------------------------------------------- |
| verified                               | normal bubble + "Verified"                                                          |
| signature/author/hash/endpoint failure | **not rendered**; "⚠ Unverified — possibly tampered by the server"                  |
| chain gap before it                    | banner "Messages have been removed or reordered by the server" at that position     |
| system message                         | italic, labelled "Platform (unverified)" (server-authored by design)                |
| unsigned, **before** the first signed  | "Unverified (legacy)" (pre-signing data; indistinguishable from a forged early row) |
| unsigned, **after** a signed message   | tampered (it cannot have been created through the API)                              |

A truncated **tail** (the last messages dropped) is not detectable — nothing follows them.

## Order terms, lifecycle actions, verdict

`src/lib/order-verification.ts` (`verifyOrderDetail`), run by `loadOrderView` (`src/hooks/orders.ts`) on
every order fetch. Result: `OrderDetailView.verification`.

- **Terms.** The checkout payload is `items: [{ keyId, sellerPubkey, price }]` — what the buyer saw. The
  server answers **409** if any price/seller changed (the cart is refetched and the user re-confirms).
  Buyer **and** seller verify the order against that signed body: every order key is in the signed items
  with the same seller and price, `totalSats` equals the signed sum (skipped for a `cancelled` order,
  whose keys went back on sale so it lists no items), `escrow.price = total + platformFee`,
  escrow buyer/seller are the signer / signed seller, and the escrow address **re-derives locally** from
  its params. The viewer's role comes from **their own key**, never from the server's `role`.
- **Lifecycle actions.** `confirm` (`/confirm` or `/deliver`, signed by the seller), `dispute` (signed by
  buyer or seller) — shown as "Confirmed by seller — signature verified" etc.
- **Verdict.** The conclude action must be signed by the **trusted arbiter** for `/api/admin/disputes/{id}/conclude`,
  its `orderId` must match, `refundAmount` must equal the sum of the refunded keys' (signed) prices,
  `conclusionStatus` must match the refunded keys, and the server's parallel fields (`refundAmount`,
  `favouredRole`, `conclusionStatus`, per-item `refunded`) must agree — any mismatch is "tampered".
  `disputeVerdictFrom` / `favouredRoleFrom` build the settlement (favoured party's
  `buildAndSignDisputeAsFavoured`, arbiter's `validateAndCosignDisputeAsArbiter`) from the **verified**
  verdict and the **signed** goods total, and **abort** if either failed verification.

Each step ends in one of: `none` (has not happened), `legacy` (happened but no action is linked — rows
created before the links, no backfill), `verified { body }`, `tampered { reason }`.

### Blocking

`verification.blocked` is non-null — and **every signing / paying / settling action is disabled** (the
buttons, plus `assertOrderActionable` inside each mutation as defence in depth) — when:

- any of terms / confirm / dispute / verdict is `tampered`;
- the operator's `getInfo()` key differs from `escrow.serverPubkey`;
- the arbiter differs from the pin and the change is not acknowledged;
- (arbiter view) the escrow's arbiter is not the admin's own key.

`legacy` records and an unreachable operator do **not** block (see below).

## Chain facts from Ark

- **Funding bar.** `useEscrowFunding` (`src/hooks/orders.ts`) reads the escrow's spendable VTXOs from the
  Ark **indexer** through the wallet context's indexer provider; the script is re-derived locally and must
  produce the stored address. It computes `total`, `funded`, soonest batch expiry, the expiry warning
  (local clock) and the sweep heuristic (`summarizeEscrowFunding`). If the indexer or wallet context is
  unavailable the bar says **"Ark indexer unavailable"** — there is no fallback to our API. The
  `GET /api/orders/[id]/funding` route is no longer used by the UI. The server keeps its own funding
  checks (`verifyEscrowFunding`) for its state machine.
- **Operator key.** `getOperatorSignerPubkey` (`src/lib/ark/operator-signer.ts`) reads `getInfo()` in the
  browser (cached 60 s). `escrow.serverPubkey` must equal it: checked at **checkout** (before any funds
  can be sent; unreachable operator → the checkout reports the order as unverified and unpaid), at order
  load, and before **any** Ark signing or payment (`assertEscrowOperator`). Unreachable ASP → explicit
  "operator unreachable" notice; actions that need the operator fail on their own.

## Arbiter pinning (TOFU)

`src/lib/arbiter-pin.ts`. The first arbiter pubkey the browser sees in an escrow is stored in
`localStorage` (per origin; every access wrapped in try/catch — unavailable storage degrades to
"unpinned"). It is pinned only **after** the order's signed terms did not fail verification, so a forged
order cannot plant its own arbiter. If a later order/escrow carries a different arbiter:

- `verification.blocked` is set and `ArbiterChangeDialog` shows the pinned and the new key;
- payment and signing stay disabled until the user explicitly acknowledges the new key (stored as an
  acknowledged alternative; the pin itself is not rewritten);
- until acknowledged, a verdict or arbiter message signed by the new key is **not trusted**, and
  dispute key/chat wraps go only to the **pinned** arbiter (`trustedArbiterPubkey`).

At checkout the arbiter only becomes known from the escrow in the response, so a mismatch there blocks
**payment** (the order exists, unpaid) and opens the dialog.

## What stays trusted (by design or by scope)

- **Server-authored data**: the catalog, system messages, timestamps, order ids and statuses
  (`order.status`, `escrow.status`). Labelled as unverifiable where it matters.
- **Legacy downgrade.** A record without a linked action is shown as `legacy` and does not block. A
  malicious server could therefore strip a link from a post-phase order to downgrade it to "legacy".
  Closing it needs a cut-off marker (no backfill exists).
- **Verdict freshness.** A re-conclusion replaces `verdict_action_id`; a server could show a party or the
  arbiter an **older**, still validly signed verdict. Not detectable client-side.
- **Fee parameters.** `platformFee` is bound to the signed total through the escrow price, but the fee
  _rate_ and the `adminDisputeShare` are server configuration without a signed anchor.
- **Tail truncation** of a chat (above), and the chat/attachment bytes (attachments are still encrypted
  with a server-side key — see [at-rest.md](./at-rest.md)).
- **TOFU** itself: the first arbiter seen is trusted. A stronger anchor (key published out of band) and
  seller-signed offers / signed reviews ("phase 4b") are out of scope.
- **Checkout privacy.** The buyer-signed checkout body lists **all** the buyer's items (every seller) and
  is returned to each seller as the signed terms of their order.
