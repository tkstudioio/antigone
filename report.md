# Antigone — Security & Correctness Audit

**First audit:** 2026-10-14 · **Re-audit and status update:** 2026-10-16
**Scope:** the whole server side (`src/app/api/**`, `src/lib/backend`, `src/lib/ark`, `src/lib/auth`,
`src/lib/crypto`, `src/lib/storage`, `prisma/schema.prisma`, `next.config.ts`) and the client flows that
handle money and keys (checkout, release, dispute, vault/session).

**Method.** Code reading only, both passes. `npx tsc --noEmit` and `pnpm lint` pass. The app was never
run: nothing was tested against a live PostgreSQL, the Ark operator or the indexer. The repo still has
no automated tests. **The dependency tree was not re-audited** on 2026-10-16: the B1 versions below were
read from `package.json`, not validated against an advisory database (`pnpm audit` was not run).

Severity scale: 🔴 Blocker (must fix before going live) · 🟠 High · 🟡 Medium · ⚪ Low.
Status markers: ✅ fixed · ⚠️ partially fixed · ❌ open · ❔ not re-verified.

## Verdict (2026-10-16)

The cryptography remains the strong part, and it got stronger: every mutation is now persisted as a
`SignedAction` and re-verified in the browser, the arbiter key never touches the server (`ADMIN_PUBKEY`
only), and the release PSBT is validated server-side with the same gates as the dispute settlement.

Since the first pass, **B2, B3 and B6 were fixed** (this session), and **B1 and B4 had already been
fixed** before it. What remains is concentrated in three areas: **non-atomic state transitions outside
checkout** (H1, H2), **no handling of Ark batch expiry** (B5), and **operational hardening** —
committed secrets (B8), no security headers (B9), mainnet configuration (B7), shared rate limiting
(H6). **The app is still not ready for production.**

---

## 🔴 Blockers

### ✅ B1. Vulnerable dependencies + open image proxy — fixed (CI step missing)

- `next@16.3.8`, `next-auth@^4.24.15`, `axios@^1.20.0` — all at or above the versions this report asked
  for.
- `next.config.ts` now allows **no** remote image host in production (`remotePatterns: []`, only
  `picsum.photos` in dev), so the optimizer is no longer an open fetcher.
- `shadcn` was moved to `devDependencies`.
- `pnpm-workspace.yaml` pins vulnerable transitive deps via `overrides` (`source-map-js`,
  `baseline-browser-mapping`) and blocks dependency build scripts outside `allowBuilds`.

**Remaining:** there is no CI at all (no `.github/workflows`), so the "run an audit in CI" item is not
done; the husky hooks run `lint-staged` and `pnpm lint` only. The dependency tree has not been
re-audited against advisories — do that before launch.

### ✅ B2. Unpaid orders never expire → the catalog can be locked for free — fixed 2026-10-16

- `src/lib/backend/mutations-order-expiry.ts`: `sweepExpiredOrders()` cancels `pending` orders whose
  escrow is unfunded after `ORDER_PAYMENT_TTL_MINUTES` (default 45) and puts their keys back on sale;
  `cancelUnpaidOrder()` is the shared, fully conditional cancellation (order → `cancelled`, keys
  released, chat closed with a system message).
- The cancellation is gated on the Ark indexer, because the `awaitingFunds → fundLocked` promotion is
  client-driven: funded → the escrow is **promoted** instead of cancelled; partially funded → nothing is
  touched (a human must look); indexer unreachable → skipped (fail closed).
- `GET /api/internal/expire-orders` (bearer `CRON_SECRET`, constant-time compare) + `vercel.json` cron
  every 10 min + `pnpm orders:expire`.
- `POST /api/orders/[id]/cancel` (signed): buyer any time while unfunded, seller after the TTL.
- Caps in `src/lib/backend/limits.ts`: `MAX_RESERVED_KEYS_PER_ACCOUNT` (50) in `reserveKeys`,
  `MAX_PENDING_ORDERS_PER_ACCOUNT` (10) at checkout.
- Two guards stop a late payment from reviving a cancelled order: `verifyEscrowFunding` never promotes
  its escrow, `confirmOrder` rejects it with 409.

See the residual risk **N1** below. Docs: `docs/account/orders.md` ("Unpaid order expiry").

### ✅ B3. Concurrent checkout creates duplicate orders and steals keys — fixed 2026-10-16

- `runCheckout` captures `now` once, and each per-seller claim is a conditional
  `updateMany({ id: { in }, orderId: null, reservedBy: buyer, reservedUntil: { gte: now } })` whose row
  count is asserted; any shortfall rolls back the **entire** request (no partial orders, no orphan
  escrow) and answers 409 with `unavailableKeys` (`not_found` / `already_sold` / `reserved_by_other` /
  `reservation_expired`).
- Checkout is now all-or-nothing: if any signed item is no longer reserved by the buyer, nothing is
  created.
- `reserveKeys` claims with one conditional `updateMany` asserting `count === quantity`; its typed
  errors map to 409 instead of the previous 500.
- No idempotency key was added, deliberately: the unique `SignedAction.nonce` rejects an exact replay,
  and a double click now loses the conditional update and gets a 409.
- Why this is enough: in PostgreSQL READ COMMITTED an `UPDATE` blocked on a row re-evaluates its `WHERE`
  against the updated row once the lock is released, so a key already claimed by a committed concurrent
  checkout no longer matches. No `FOR UPDATE`, no Serializable.

**Not verified at runtime:** the concurrency behaviour was reasoned about and typechecked, never
exercised against a live PostgreSQL. A parallel-request test is still owed.

### ✅ B4. The admin can change the verdict while the escrow is `settling` — was already fixed

The claim is stale. `concludeOrderAsAdmin` (`src/lib/backend/mutations-orders.ts:524`) treats
`settling`, `completed`, `refunded` and `expiredSwept` as final (409 "Dispute already settled, not
modifiable"), the escrow write inside the transaction is conditional on the status observed before it
(`count === 0 → EscrowChangedError` → rollback), `cosignDisputeSettlementAsAdmin` is guarded on
`settlementPrepared` and `prepareDisputeSettlement` on `disputed`/`settlementPrepared`. The premise was
also wrong: in `settlementPrepared` **no arbiter signature has been issued yet** (only the favoured
party's), so re-concluding there is safe — and it discards the stored PSBTs. `docs/admin.md` and
`docs/lifecycle.md` already describe exactly this.

### ⚠️ B5. Escrow funds can expire and be lost (batch expiry) — visibility only, no enforcement

What exists: `getEscrowFunding` returns `soonestExpiry`; `readEscrowFunding`
(`query-orders.ts:225-263`) and `useEscrowFunding` (`hooks/orders.ts:297-334`) compute `expirySoon`
(3-day window) and a `swept` heuristic; `EscrowFundingBar` warns; `verifyEscrowFunding` can mark
`expiredSwept`; and since 2026-10-16 the expiry sweeper counts and logs `expiringSoon` for every live
escrow it queries.

What is still missing — and one correction to the original fix proposal:

- **Do not** "reject `fundLocked`/`confirm` when the expiry is near" as written: refusing the promotion
  protects nobody, because the funds are already locked and there is **no refund path before a
  dispute** — the buyer would simply be stranded.
- The expiry is **not a property of the escrow**: it is inherited from the VTXOs the buyer pays with.
  The useful check is therefore **client-side, before paying** (`getSpendableVtxos()` exposes
  `virtualStatus.batchExpiry`; `IWallet.settle()` renews VTXOs into a fresh batch), plus refusing the
  seller's `confirm` under a safety margin, plus an alerting job.
- The CSV exit (Stage 2) is still unimplemented: `/settle/exit` returns 501.

### ✅ B6. The buyer cannot open a dispute after the keys are delivered — fixed 2026-10-16

`order-actions-panel.tsx` now renders **one** secondary "Open dispute" affordance outside the `match`
block, driven by the shared `canOpenDispute()` (`src/lib/escrow-status.ts`), so it covers both roles in
`fundLocked` **and** `sellerReady` — i.e. it is present exactly when the keys have just been delivered
and an invalid code is discovered. The two duplicated per-branch buttons were removed; the button stays
visible but disabled while the order fails verification.

`buyerCheckpointsSigned` is still not disputable (by design, documented): reopening that window needs
the server-side work in H2 first.

### ❌ B7. Network hardcoded to mutinynet — open

- `src/lib/ark/operator.ts:33` → `hrp: networks.mutinynet.hrp`; `src/lib/ark/escrow.ts:246` defaults to
  the same.
- `src/lib/ark/index.ts:7` → `ARK_SERVER_URL` defaults to `https://mutinynet.arkade.sh`.
- `src/components/wallet-overview.tsx:54-55` → explorer links to `mutinynet.com` /
  `explorer.mutinynet.arkade.sh`.

**Fix:** derive the network/hrp from the operator's `getInfo`, make the URL a required env var, make the
explorer configurable.

### ❌ B8. Secrets committed to the repository — open, and still tracked

- `design/.obsidian/plugins/obsidian-local-rest-api/data.json` is **still present and still tracked**
  (`git ls-files` lists it) and still in history (commit `644cc10`). It contains an `apiKey` and a TLS
  **private key**, with the insecure server enabled.
- `.gitignore` only excludes `.mcp.json`; the Obsidian plugin data is not ignored.
- The repo has a GitHub remote.

**Fix (unchanged, and now the highest-priority item on this list):** rotate the key and certificate,
`git rm --cached` the file and purge it from history (`git filter-repo`), add it to `.gitignore`, add
secret scanning (gitleaks) to the hooks and to CI, and make the server refuse to start with example
values (the "abandon …" mnemonic, `change-me`, an empty `ENCRYPTION_KEY`).

### ❌ B9. No security headers or CSP, while private keys sit in browser storage — open

`next.config.ts` still sets no `headers()`, and `src/proxy.ts` only gates the signature headers on
mutations. The unlocked private key lives in `sessionStorage` and the encrypted vault in
`localStorage`, so any XSS means stolen keys and funds.

**Fix:** a strict CSP (nonce-based `script-src`, no `unsafe-inline`), HSTS,
`frame-ancestors 'none'` / `X-Frame-Options`, `X-Content-Type-Options: nosniff`, `Referrer-Policy`,
`Permissions-Policy`.

---

## 🟠 High

### ❌ H1. State transitions are not atomic (TOCTOU) — open outside checkout

Fixed in checkout and reservation (B3) and already correct in the dispute-settlement mutations
(`mutations-dispute.ts` uses conditional `updateMany` + 409). Still read-then-write with an
unconditional `escrow.update` / `order.update`: `prepareRelease` (`mutations-orders.ts:359`),
`collaborateRelease` (`:390`), `finalizeRelease` (`:419`), `openDispute` (`:460`), `confirmOrder`
(`:174`). The races described originally therefore stand — a dispute opened while the seller runs
`prepareRelease` is overwritten back to `sellerReady`, and `confirmOrder` racing `openDispute` leaves
the order `completed` with the escrow `disputed` (invisible in the admin list, which filters on order
status).

**Fix:** every transition uses `updateMany({ where: { id, status: expected } })` with a `count === 1`
check (409 otherwise) inside a transaction covering the order/escrow pair.

### ⚠️ H2. `collaborateRelease` and `finalizeRelease` validate nothing — prepare now validated

- `prepareRelease` **is** now fully validated before persisting: `decodeSettlementTx`,
  `assertSpendsOnlyEscrow` against the escrow's own outpoints, `assertOutputsMatch` (platform fee bound
  to the admin's pkScript), `assertValueConserved` — the same gates as the dispute path.
- Still unvalidated: `collaborateRelease` stores `collabArkTxid` and the buyer checkpoints blindly, so a
  malicious buyer can store garbage and strand the seller (and `buyerCheckpointsSigned` is not a
  disputable state).
- `finalizeRelease` still marks the escrow `completed` without reconciling against the indexer.
- The client-side counterpart (`finalizeReleaseAsSeller` signing DB-provided checkpoints without
  comparing them to the tx the seller built) was not re-verified. ❔

### ❌ H3. `concludeOrderAsAdmin` does not require an open dispute — open

Still no check on `order.status`: the admin can impose a verdict on any funded order, including one
never disputed. **Fix:** require order `disputed` or `concluded` (and escrow `disputed`).

### ❌ H4. The admin can be a party, and a buyer can trade with themselves — open

No guard in cart, checkout or stock upload. If the admin is the seller, the
`buyer+admin+operator` / `seller+admin+operator` leaves collapse to the admin alone and the 2-of-3
guarantee is gone. (Note: the `own_key` rejection reason that `docs/account/orders.md` used to promise
was deliberately **not** added in the B3 work, precisely because this guard does not exist yet.)

### ⚠️ H5. One indexer reading leads to an irreversible terminal state — narrowed, not closed

`verifyEscrowFunding` now only flips to `expiredSwept` when `fundedAt != null` **and** the status is
`fundLocked`/`disputed`/`settlementPrepared` (never `sellerReady`/`settling`, where a legitimate spend
may be in flight), and `readEscrowFunding` computes its `swept` flag read-only. Still: a single negative
reading is enough, and `concludeOrderAsAdmin` with `escrowFunded = false` still drives the escrow to
`completed`/`refunded` and closes the chat without any funds moving. **Fix:** distinguish spent / never
funded / expired using the indexer's own flags, retry, keep the state recoverable.

### ⚠️ H6. Rate limiting, the nonce replay guard and the operator cache live in memory

- **Replay guard: resolved.** The anti-replay store is now the unique `nonce` column of
  `signed_action` in PostgreSQL, so it survives restarts and spans instances. There is no
  `replay-guard.ts` any more.
- **Rate limiting: open.** `src/lib/auth/rate-limit.ts` is still an in-memory `Map` on `globalThis`, and
  it is applied **only** to `POST /api/auth/challenge` and `POST /api/auth/register` — nothing on login,
  cart, `verify-funding` (which hammers the indexer) or uploads. The register limiter is still keyed on
  a client-supplied header.

**Fix:** move the limiter to Redis/Upstash (or a DB table), take the client IP only from the trusted
proxy, and cover the expensive endpoints.

### ❌ H7. Login denial of service — open

`src/app/api/auth/challenge/route.ts` still upserts **one** challenge per pubkey (`Challenge.pubkey` is
unique) and rate-limits by the target's pubkey, so an attacker can keep overwriting a victim's challenge
and burn their budget. Mitigated slightly: expired rows are deleted on every call, so random pubkeys no
longer accumulate without bound. **Fix:** several id-addressed challenges per pubkey, rate limit by IP.

### ✅ H8. `ADMIN_MNEMONIC` is a hot, multi-purpose key in env — resolved by design change

`ADMIN_MNEMONIC` no longer exists anywhere in the code or in `.env.example`. The server holds only
`ADMIN_PUBKEY`, a **public** value; the arbiter signs in the admin's own browser, and the admin key is
no longer derived per request in the `jwt` callback.

**Residual (by design, worth a decision):** one identity is still simultaneously the admin login, the
escrow arbiter and the fee recipient. Separating the fee-receiving key from the arbiter key remains
desirable, but no private key sits on the server any more.

### ❌ H9. `ADMIN_DISPUTE_SHARE_PERCENT` breaks full refunds — open (confirmed)

`src/lib/fees.ts:62-65`: `adminReceives = platformFee + adminDisputeShare` and
`sellerReceives = totalSats - adminDisputeShare - refundAmount`, with `sellerReceives < 0 → return
null` → 422. So with a share > 0 a full refund (`cancelled`) is impossible, exactly as reported. The
comment two lines above the formula still claims the opposite ("neither is docked from the seller, who
paid neither"), which is how the bug survives review. The default is 0, so it stays latent. **Fix:** decide who pays the share, fix the formula and
`docs/escrow/fees.md`, add unit tests.

### ❌ H10. Dust and amount limits — open

No minimum price relative to the operator's dust threshold (`src/validators/index.ts` only requires
`z.number().int().positive()`), no maximum, prices still `Int` (int4, ~21.47 BTC). The dispute breakdown
can still produce sub-dust outputs that the operator rejects, leaving an unsettleable escrow.

---

## 🟡 Medium

1. **❌ Chat attachments are not bound to their chat.** Improved but not closed: the upload route
   (`POST /api/chat/[id]/attachment`) is signed, enforces the MIME allowlist, the 5 MB cap and a name
   length, and **derives the object key server-side** (`putChatObject({ chatId, … })`). But the message
   body still carries a client-chosen `attachment.key` (`chatAttachmentSchema`, `key: z.string()`) which
   is persisted verbatim (`query-chat.ts:246`), so a message can still reference any bucket object and
   the download route will decrypt it. **Fix:** enforce the `chat/${chatId}/` prefix at message
   creation, or record uploads server-side and accept only a reference to one.
2. **⚠️ Uploads are unbounded.** Size, MIME allowlist and file name are now validated, and the upload is
   signed. Still missing: per-account quota and rate limit, magic-byte sniffing (the MIME still comes
   from the client), orphaned-object cleanup, and `X-Content-Type-Options: nosniff` /
   `Content-Disposition: attachment` on download.
3. **❌ `/api/images/[...key]` uses a denylist** (`key[0] === "chat"`, `route.ts:11`). Next decodes path
   segments, so a percent-encoded `chat%2F…` arrives as a single segment and slips past the check
   (reasoned, not tested). Impact stays limited because chat objects are encrypted at rest.
   **Fix:** allowlist the product-image prefix instead.
4. **❌ `grant-admin` upserts** (`query-chat.ts:298`): `update: { wrappedCek, wrapperPubkey }` lets one
   party overwrite the admin's `MessageKey` rows for the other party's messages, and the function checks
   only that the caller is a party — there is still no dispute gate. **Fix:** insert-only, per wrapper,
   and require an active dispute.
5. **❌ Registration.** `Account.username` still has no unique constraint and the register route still
   upserts, so an account can rename itself and anyone can register "admin" or copy a seller's name.
   **Fix:** unique usernames, a reserved-name list, pubkey fingerprints in the UI.
6. **✅ Checkout verification on the client trusts the server — fixed.** `useCheckout`
   (`src/hooks/cart.ts`) now aborts unless the signed total matches the prices, `escrow.price ===
totalSats + platformFee`, every escrow address re-derives locally, the operator key equals the
   operator's own `getInfo()` and the arbiter passes the TOFU pin (`checkArbiter`).
7. **⚠️ Unhandled errors become 500s.** Fixed on the paths touched by B2/B3: `reserveKeys` and the
   checkout now return typed 409s (including "not enough keys", previously a 500). Other routes were not
   swept for the same pattern. ❔
8. **❌ The admin chat list (`/api/chats`) exposes metadata of all chats**, not only disputed ones: the
   route gates on `isAdmin` and `queryChats` applies no dispute filter.
9. **❔ Overfunding on the happy path** (extra funds going to the seller; funds arriving between prepare
   and collaborate stranding the release because the seller cannot re-prepare from `sellerReady`) — not
   re-verified in this pass.

---

## ⚪ Low / hygiene

- **✅ Unused login route removed.** `src/app/api/auth/` now contains only `[...nextauth]`, `challenge`
  and `register`.
- **✅ Admin key re-derived per request — gone** with `ADMIN_MNEMONIC` (see H8).
- **✅ Non-repudiation for chat messages — now holds.** Every signed mutation is persisted as a
  `SignedAction` (method, path, ts, nonce, body hash, signature) and the browser re-verifies messages
  plus the per-chat hash chain. ECIES is still static-static (no forward secrecy).
- **⚠️ TLS verification.** `src/db/index.ts:22` still sets `rejectUnauthorized: false` when
  `DATABASE_SSL_NO_VERIFY=true`, but the comment now describes that accurately ("skip hostname/chain
  checks"). It is an opt-in footgun, no longer a mislabelled one.
- **⚠️ Catalog query.** `queryProducts` is paginated at the API (`page`/`pageSize`, max 100) but still
  merges the full set in memory before slicing (`query-products.ts:123`), so the scalability concern
  stands.
- **❌ Long-lived sessions.** 24h JWTs, no revocation.
- **❌ No key separation.** One key for login, request signing and Ark funds, with no domain separation
  (low risk today: signed messages are never 32 bytes).
- **⚠️ Italian strings remain.** Fixed in `orders-status.ts`, `readEscrowFunding` and everything written
  by the 2026-10-16 work. Still Italian: most error strings in `mutations-orders.ts`
  (`verifyEscrowFunding`, `prepareRelease`, `collaborateRelease`, `finalizeRelease`), several validator
  messages in `src/validators/index.ts`, and some `.env.example` comments.
- **❌ No tests.** Still none.

---

## New residual risks (introduced or surfaced by the 2026-10-16 fixes)

### N1. Pay-after-cancel window (TOCTOU on the funding gate)

Between the indexer reporting zero and the cancellation committing, the buyer can pay. The order is then
`cancelled` with its keys resold, while the funds sit in an escrow that `verifyEscrowFunding`
deliberately refuses to promote — and there is no refund path before a dispute. The window is small (the
TTL is 45 min and the UI shows no "Pay" on a cancelled order), but it exists. **Mitigation:** re-read
the funding right after cancelling and alert the admin when funds appeared, and give the admin a
recovery path for a funded-but-cancelled escrow.

### N2. Partially funded expired orders need a human

The sweeper deliberately skips them (funds are at stake) and only logs. There is no admin view listing
them, so today they are visible only in the logs and in the job's `skipped` counter.

---

## Outside the code, required for launch

- **Backups.** `Escrow.nonce` exists only in the DB, and without it an escrow cannot be spent. Losing
  `ENCRYPTION_KEY` makes every chat attachment unreadable. Both need encrypted, tested backups.
- **Escrow reconciliation.** A job comparing DB state with the indexer, plus monitoring and alerts on
  expiry and stuck states. The expiry sweeper (B2) is the natural place to grow it: it already queries
  the indexer for every live escrow and counts `expiringSoon`.
- **CI.** There is none. It should at least run `tsc`, `pnpm lint`, a dependency audit and secret
  scanning.
- **Edge protection.** Rate limiting and a WAF at the edge.
- **Private storage.** Make the MinIO bucket private, with no public listing.
- **Tests:**
  - unit tests for `fees.ts`, `tx-validation.ts` and the state machine;
  - concurrency tests for checkout and the transitions (the B3 fix is still unexercised at runtime);
  - e2e tests against a regtest `arkd`.
- **Legal.** Terms of service, a GDPR privacy policy, and a regulatory review of the fee and arbitration
  model.

## Suggested fix order (remaining work)

1. **B8:** rotate the committed key/certificate, purge it from history, add secret scanning. It is the
   only item whose damage is already done and still growing.
2. **H1 + H2:** conditional transitions everywhere, validation of the buyer's checkpoints, indexer
   reconciliation before `completed`.
3. **B5:** client-side VTXO expiry check before paying (plus renewal via `settle()`), confirm-time
   margin, alerting job.
4. **H3, H4, H5:** require an open dispute to conclude, forbid admin-as-party and self-trades, stop
   going terminal on one indexer reading.
5. **B9, H6, H7:** headers/CSP, shared rate limiting on the expensive endpoints, challenge redesign.
6. **H9, H10:** the dispute-share formula (with tests), dust and amount limits.
7. **B7:** mainnet configuration.
8. **N1, N2:** recovery path for a funded-but-cancelled escrow, admin visibility for partially funded
   expired orders.
9. Medium and Low items, CI, tests, remaining Italian strings.
