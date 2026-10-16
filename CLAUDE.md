# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

> **HARD RULE — English only.** Everything you _write_ — code, comments, identifiers, documentation,
> file content (including the `design/` Obsidian vault, even when built from an Italian source) — must
> be in **English**, no exceptions. You may _converse_ with the user in the language they use, but
> every produced artifact is English-only.

## Project

Antigone — Next.js 16 (App Router) marketplace prototype. Auth uses Schnorr signatures over secp256k1 (BIP39 mnemonic → derived key) instead of passwords. Persists to PostgreSQL via Prisma Client (PostgreSQL provider, `@prisma/adapter-pg`).

### How the project is structured

The app is organized into **domains**, where a domain is a route group under `src/app/` with its own layout, paired with the API routes and backend logic that serve it:

- **`(auth)`** — passwordless authentication via Schnorr challenge–response; key derivation happens client-side only.
- **`(shop)`** — public storefront: product catalog and detail (the only domain with unauthenticated APIs).
- **`(account)`** — authenticated user area: cart/reservation, orders, seller stock, Arkade wallet (under `(account)/dashboard`), order chat.
- **`(admin)`** — platform moderation (disputes and chat) and product catalog management, gated on `session.user.isAdmin`.

The typical request path is: thin server-component **page** → client **table/component** (`src/components/`) → **hook** (`src/hooks/`) using the `backend` axios client → **API route** (`src/app/api/`) → **backend module** (`src/lib/backend/query-*.ts` for reads, `mutations-*.ts` for writes) → Prisma (`src/db/`). Mutations are signed (`postSigned` → `signedRoute`); reads and writes share Zod schemas in `src/validators/`.

## Documentation

Detailed flow docs live in **[`docs/`](./docs/README.md)** on **3 levels** (start at `docs/README.md` for the map): this file (L1) keeps orientation + a synthesized architecture; **L2** files (below) carry pages, entities, and `resource→endpoint→backend` tables; **L3** files (`docs/<area>/*.md`) carry the mechanics. The L2 files are referenced here and loaded on demand; L3 files are referenced from their L2 parent, not here.

Domains:

- @docs/auth.md — `(auth)`: passwordless Schnorr auth, session, admin identity
- @docs/shop.md — `(shop)`: public storefront, catalog, product detail, SEO
- @docs/account.md — `(account)`: cart, orders, stocks, wallet, order chat
- @docs/admin.md — `(admin)`: dispute moderation, admin chat, product catalog, arbiter wallet

Cross-cutting (shared protocol):

- @docs/escrow.md — Arkade-OS escrow contract, release, dispute settlement, fees
- @docs/crypto.md — request signing, E2E messaging, at-rest encryption, client-side verification of server data
- @docs/data.md — Prisma entities/relations, enums, adapter, migrations
- @docs/lifecycle.md — order + escrow state machine (single source of truth)
- @docs/glossary.md — domain vocabulary (escrow, VTXO, 13th word, …); start here when onboarding

**Always update the documentation.** Whenever you change a flow — pages, API endpoints, backend functions, hooks, the order lifecycle, or anything else the docs describe — update the relevant file **at the right level** (L2 orientation vs L3 mechanics) in the same change. This is not optional: code and docs must never drift.

## Commands

```bash
pnpm dev              # Next dev server
pnpm build            # prisma generate + prisma migrate deploy + next build
pnpm lint             # ESLint (flat config, eslint.config.mjs)
pnpm format           # prettier --write . (also runs on staged files via lint-staged/husky)
pnpm db:generate      # Prisma: regenerate typed client from schema.prisma
pnpm db:migrate       # Prisma: apply pending migrations (prisma migrate deploy)
pnpm db:migrate:dev   # Prisma: create + apply new migration in development
pnpm db:seed          # tsx src/db/seed.ts — sample products
pnpm db:anti-seed     # tsx src/db/anti-seed.ts — tear down dev data
pnpm derive:pubkey    # local only: DERIVE_MNEMONIC/DERIVE_PASSPHRASE env → ADMIN_PUBKEY
```

Node `v22.22.2` (`.nvmrc`). Package manager: **pnpm** (pinned via the `packageManager` field; settings
live in `pnpm-workspace.yaml`, not in `package.json`). Dependency build scripts are blocked unless
listed under `allowBuilds`, and `minimumReleaseAge` holds back packages published in the last 24h.

## Architecture

### Auth & signed mutations

Passwordless Schnorr (secp256k1) challenge–response; client-side key derivation (mnemonic + passphrase, BIP84 `m/84'/0'/0'/0/0`) never leaves the browser. NextAuth `jwt` session (24h). Every data-mutating API call is signed (`postSigned` / `uploadSigned` → `signedRoute`): the client signs a v2 envelope binding method + path (with query) + timestamp + nonce + SHA-256 of the raw body (120s window) and sends it in `x-antigone-signature` / `-timestamp` / `-nonce` headers, body untouched. `src/proxy.ts` rejects unsigned mutations fail-closed (allowlist: `/api/auth/challenge` + NextAuth internals); `signedRoute` verifies and persists every request as a `SignedAction` row, whose unique nonce is the (Postgres) anti-replay store. → flows in `docs/auth/flows.md`, key/vault in `docs/auth/keys-vault.md`, signing in `docs/crypto/signing.md`.

### Client-side verification (the browser does not trust the server)

Domain rows link to the `SignedAction` behind them (`Message`, `Order` checkout/confirm/dispute/verdict, `KeyCodeKey`) and the API returns those actions; the browser re-verifies them (`src/lib/auth/verify-signed-action.ts`: expected author + method + path, body hash, Schnorr) and renders from the **signed body**. Chat messages form a per-chat hash chain (`prevHash` in the signed body, 409 on a stale tail); the checkout payload is the buyer-signed terms (`items`, 409 on price/seller drift); the arbiter's verdict is verified against the **pinned** arbiter (TOFU, `src/lib/arbiter-pin.ts`) and the settlement is built from it. Escrow funding comes from the Ark indexer in the browser and `escrow.serverPubkey` must equal the operator's own `getInfo()`. Any failure disables signing/paying/settling for that order (`order.verification.blocked`). → `docs/crypto/verification.md`.

### Admin identity

`ADMIN_PUBKEY` (server-only env, a **public** key: 33-byte compressed secp256k1, hex) identifies the platform admin: `isAdmin` = session pubkey equals it, and it is the escrow arbiter pubkey at checkout. The server **never holds the admin's mnemonic or private key** — the arbiter co-signs dispute settlements in the admin's own browser. Derive the value locally with `pnpm derive:pubkey`. Omit/invalid → admin disabled. → `docs/auth.md` (Admin identity), `docs/escrow/dispute.md`.

### Route groups

`src/app/` uses four groups, each with own layout:

- `(auth)` — login, create, restore
- `(admin)` — admin-only area (disputes, catalog, wallet); gated on `session.user.isAdmin`
- `(account)` — authenticated user area: `cart`, `orders`, `stocks`, and `dashboard` (Arkade SDK wallet, secp256k1 wallet UI)
- `(shop)` — product browsing

API routes live under `src/app/api/`: `auth/{challenge,register,[...nextauth]}`, plus `admin`, `cart`, `chat`, `chats`, `internal` (cron-only, e.g. `expire-orders`), `orders`, `products`, `stocks`, and `images/[...key]` (public proxy for product images only — chat attachments under prefix `chat/` return 404 and are served exclusively via the authenticated `GET /api/chat/[id]/attachment/[messageId]` route).

### Data layer

Prisma Client + `PrismaPg` adapter (singleton `src/db/index.ts`, `DATABASE_URL` required at import). Domain entities in `prisma/schema.prisma` (snake_case via `@map`). Key relation: `Key.orderId → Order.escrowAddress → Escrow` (no direct key↔escrow FK). Import status enums from `src/db/enums.ts`, not from Prisma types. → `docs/data.md`.

### Escrow & crypto

Each order has a **trustless Arkade-OS escrow** (7-leaf taproot; buyer/seller/admin/operator). Checkout creates it, the seller+buyer release it collaboratively on the happy path, and on dispute the admin-favoured party prepares the settlement, the arbiter co-signs it in the admin's browser (the server holds no arbiter key), and the favoured party finalizes. → `docs/escrow.md`. License-key codes are E2E-encrypted like chat text (same envelope scheme, per-recipient `KeyCodeKey`: the seller encrypts at upload, re-wraps toward the buyer at confirmation = delivery, and a dispute party re-wraps toward the arbiter), so the server holds no key that can read them; chat attachments are encrypted at rest server-side (AES-256-GCM). Chat text is E2E-encrypted (ECIES, per-recipient `MessageKey`), with admin read access gated on the dispute (`src/lib/backend/dispute-access.ts`). → `docs/crypto.md`.

### Frontend conventions

Authoritative skill: `.claude/skills/fe-patterns/SKILL.md`. Read it before building any list/table page. Key rules:

- Pages = thin server components; logic lives in `src/components/<resource>-table.tsx` client components.
- Data hooks are grouped by domain in `src/hooks/<resource>.ts` (one file per domain — e.g. `accounts.ts`, `orders.ts`, `cart.ts`, `admin.ts`, `wallet.ts`, `chat.ts` — no `use-` prefix; `use-mobile.ts` is a UI utility exception). Always go through the `backend` axios instance from `src/lib/backend/index.ts` (`baseURL: "/api"`). Axios wraps response in `.data` — destructure as `data.data.{data,total,pageSize}`.
- URL state via single `useQueryStates` (nuqs) call, never separate `useQueryState` calls.
- Search debounce: `useDebounceValue` from `usehooks-ts` (NOT `useDebounceCallback` — closure instability bug). Compare `debouncedInput === query.search` instead of `isMounted` ref pattern.
- `totalPages` always `Math.ceil(total / pageSize)`.
- Render with `match()` from `ts-pattern` over react-query result.
- **English is the only language for everything** — UI strings, code, comments, identifiers, and documentation. The project is international; never introduce Italian (or any other language) in user-facing text or code. Numbers `toLocaleString("en-US")`. Null → `"—"`.
- **Prices are in satoshi (integer, no decimals).** Always use `formatPrice()` from `src/lib/utils.ts` — outputs `"1,234 sats"` via `Intl.NumberFormat("en-US")`. Never use `€` or float formatting for prices.

UI primitives: shadcn (`style: radix-vega`, base `neutral`, lucide icons) in `src/components/ui/`. Theme
colors in `src/app/globals.css` come from the TKStudio Design System (Figma) primitives — each value is
commented with the primitive it resolves to; only the existing variables are used, none added.
Typography (loaded with `next/font` in `src/app/layout.tsx`): Noto Sans for the UI (`font-sans`), Noto
Sans Mono for pubkeys/addresses/txids (`font-mono`), Cinzel for display headings only — `H1`, section
`h2`s, hero (`font-serif`, `font-semibold`). Never use Cinzel for numbers, amounts or body text (it has no
true lowercase).
Brand marks: `Logo` (`src/components/ui/logo.tsx`; `variant` `wordmark` = ANT▮GONE with the Rubin-vessel
mark as the I, or `lockup` = mark + ANTIGONE; `currentColor`) and `Icon` (`icon.tsx`; the vessel in
negative on a theme-aware tile). Text is outlined Cinzel, so no font dependency. Static copies in
`public/` (`logo.svg`, `logo-lockup.svg`, `logo-mark.svg`, `icon.svg`); favicon `src/app/icon.svg` +
`apple-icon.png`. Aliases: `@/components`, `@/lib`, `@/hooks`, `@/components/ui`.

### Providers

`src/providers/index.tsx` wraps app with `SessionProvider`, `QueryClientProvider`, `NuqsAdapter`, `TooltipProvider`, `ToastContainer`. Mounted from `src/app/layout.tsx` after `getServerSession(authOptions)`.

### State stores (Zustand)

- `src/stores/wallet.ts` — local Arkade wallet state (Wallet, addresses, balance, custom VTXO scripts).
- `src/stores/profile.ts` — owns Arkade SDK provider construction (`ExpoArkProvider`, `ExpoIndexerProvider`, `BoltzSwapProvider`, `VtxoManager`, `ArkadeSwaps`). `setAccount(account)` derives privkey from mnemonic and constructs Wallet. Reads `NEXT_PUBLIC_ARK_OPERATOR_URL` and `NEXT_PUBLIC_BOLTZ_SWAP_PROVIDER`.

### Validators

Zod schemas in `src/validators/index.ts`. Reused on both client (form validation) and server (parsed by `signedRoute` in route handlers). Signed-payload schemas describe the domain payload only — the signature travels in headers, never in the body.

## Environment

Required (see `.env.example` + `.env.local`):

- `NEXTAUTH_URL`, `NEXTAUTH_SECRET` — auth-options throws at import time if `NEXTAUTH_SECRET` missing.
- `ADMIN_PUBKEY` — server-only, public: the admin's compressed pubkey (hex). The admin must log in with the identity (mnemonic + passphrase) behind it. Never put the admin mnemonic/passphrase on the server; derive the value locally with `pnpm derive:pubkey`. Omit/invalid disables admin. → `docs/auth.md`.
- `NEXT_PUBLIC_ARK_OPERATOR_URL`, `NEXT_PUBLIC_BOLTZ_SWAP_PROVIDER` — Arkade wallet runtime.
- `DATABASE_URL` — required. Points to the PostgreSQL instance (`docker compose up -d postgres` uses the value in `.env.example`).
- `ENCRYPTION_KEY` — server-only, 32-byte base64. Encrypts **chat attachments** at rest (AES-256-GCM); license codes do not use it (they are E2E-encrypted in the browser). Protects against DB/storage compromise, not a compromised app server.

- `CRON_SECRET` — server-only bearer token for `GET /api/internal/expire-orders` (Vercel Cron sends it as `Authorization: Bearer …`); the route refuses to run when unset.
- `ORDER_PAYMENT_TTL_MINUTES` (default 45) — minutes a buyer has to pay before an unpaid order can expire/be cancelled by the seller. `MAX_RESERVED_KEYS_PER_ACCOUNT` (default 50) and `MAX_PENDING_ORDERS_PER_ACCOUNT` (default 10) — per-account caps on cart reservations and open unpaid orders. → `docs/account/orders.md`.

- `S3_ENDPOINT`, `S3_REGION`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`, `S3_BUCKET` — server-only, any S3-compatible store (MinIO via docker compose locally, Cloudflare R2 on Vercel) for chat attachments (dispute evidence) and product images. Chat objects are stored encrypted at rest; the app proxies and decrypts chat attachment downloads through `GET /api/chat/[id]/attachment/[messageId]` (no presigned URLs). Storage client in `src/lib/storage/s3.ts`.

## .claude tooling

- `agents/` — `planner` (writes `.claude/tasks/<slug>.md`), `developer` (executes a task file), `versioner` (commit + version bump, never pushes, requires confirmation).
- `skills/fe-patterns` — frontend list/table patterns (rigid; see above).
- `skills/{shadcn-ui,tanstack-query,react-hook-form,conventional-commit-message-generator}` — domain skills.
- `tasks/` — planner output; agent reads from here when executing a task.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
