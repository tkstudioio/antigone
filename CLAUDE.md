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
- **`(admin)`** — platform moderation: disputes and chat, gated on `session.user.isAdmin`.

The typical request path is: thin server-component **page** → client **table/component** (`src/components/`) → **hook** (`src/hooks/`) using the `backend` axios client → **API route** (`src/app/api/`) → **backend module** (`src/lib/backend/query-*.ts` for reads, `mutations-*.ts` for writes) → Prisma (`src/db/`). Mutations are signed (`postSigned` / `verifySignedJsonBody`); reads and writes share Zod schemas in `src/validators/`.

## Documentation

Detailed flow docs live in **[`docs/`](./docs/README.md)** on **3 levels** (start at `docs/README.md` for the map): this file (L1) keeps orientation + a synthesized architecture; **L2** files (below) carry pages, entities, and `resource→endpoint→backend` tables; **L3** files (`docs/<area>/*.md`) carry the mechanics. The L2 files are referenced here and loaded on demand; L3 files are referenced from their L2 parent, not here.

Domains:

- @docs/auth.md — `(auth)`: passwordless Schnorr auth, session, admin identity
- @docs/shop.md — `(shop)`: public storefront, catalog, product detail, SEO
- @docs/account.md — `(account)`: cart, orders, stocks, wallet, order chat
- @docs/admin.md — `(admin)`: dispute moderation, admin chat, arbiter wallet

Cross-cutting (shared protocol):

- @docs/escrow.md — Arkade-OS escrow contract, release, dispute settlement, fees
- @docs/crypto.md — request signing, E2E messaging, at-rest encryption
- @docs/data.md — Prisma entities/relations, enums, adapter, migrations
- @docs/lifecycle.md — order + escrow state machine (single source of truth)
- @docs/glossary.md — domain vocabulary (escrow, VTXO, 13th word, …); start here when onboarding

**Always update the documentation.** Whenever you change a flow — pages, API endpoints, backend functions, hooks, the order lifecycle, or anything else the docs describe — update the relevant file **at the right level** (L2 orientation vs L3 mechanics) in the same change. This is not optional: code and docs must never drift.

## Commands

```bash
yarn dev              # Next dev server
yarn build            # prisma generate + prisma migrate deploy + next build
yarn lint             # ESLint (flat config, eslint.config.mjs)
yarn format           # prettier --write . (also runs on staged files via lint-staged/husky)
yarn db:generate      # Prisma: regenerate typed client from schema.prisma
yarn db:migrate       # Prisma: apply pending migrations (prisma migrate deploy)
yarn db:migrate:dev   # Prisma: create + apply new migration in development
yarn db:seed          # tsx src/db/seed.ts — sample products
yarn db:anti-seed     # tsx src/db/anti-seed.ts — tear down dev data
```

Node `v22.22.2` (`.nvmrc`). Package manager: yarn.

## Architecture

### Auth & signed mutations

Passwordless Schnorr (secp256k1) challenge–response; client-side key derivation (mnemonic + passphrase, BIP84 `m/84'/0'/0'/0/0`) never leaves the browser. NextAuth `jwt` session (24h). Authenticated mutations are signed (`postSigned` → `verifySignedJsonBody`), with a canonical envelope binding method+path+timestamp+nonce+payload (120s window, single-use nonces, in-memory). → flows in `docs/auth/flows.md`, key/vault in `docs/auth/keys-vault.md`, signing in `docs/crypto/signing.md`.

### Admin identity

`ADMIN_MNEMONIC` + `ADMIN_PASSPHRASE` (server-only) derive the platform admin pubkey; `ADMIN_PASSPHRASE` **must** equal the passphrase the admin uses in the UI or no one is admin. The same identity is the escrow arbiter and dispute co-signer. Omit/invalid → admin disabled. → `docs/auth.md` (Identità admin).

### Route groups

`src/app/` uses four groups, each with own layout:

- `(auth)` — login, create, restore
- `(admin)` — admin-only area (disputes, wallet); gated on `session.user.isAdmin`
- `(account)` — authenticated user area: `cart`, `orders`, `stocks`, and `dashboard` (Arkade SDK wallet, secp256k1 wallet UI)
- `(shop)` — product browsing

API routes live under `src/app/api/`: `auth/{challenge,login,register,[...nextauth]}`, plus `admin`, `cart`, `chat`, `chats`, `orders`, `products`, `stocks`, and `images/[...key]` (public proxy for product images only — chat attachments under prefix `chat/` return 404 and are served exclusively via the authenticated `GET /api/chat/[id]/attachment/[messageId]` route).

### Data layer

Prisma Client + `PrismaPg` adapter (singleton `src/db/index.ts`, `DATABASE_URL` required at import). Domain entities in `prisma/schema.prisma` (snake_case via `@map`). Key relation: `Key.orderId → Order.escrowAddress → Escrow` (no direct key↔escrow FK). Import status enums from `src/db/enums.ts`, not from Prisma types. → `docs/data.md`.

### Escrow & crypto

Each order has a **trustless Arkade-OS escrow** (7-leaf taproot; buyer/seller/admin/operator). Checkout creates it, the seller+buyer release it collaboratively on the happy path, and the admin-favoured party settles it on dispute. → `docs/escrow.md`. License-key codes and chat attachments are encrypted at rest (AES-256-GCM); chat text is E2E-encrypted (ECIES, per-recipient `MessageKey`), with admin read access gated on the dispute (`src/lib/backend/dispute-access.ts`). → `docs/crypto.md`.

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

UI primitives: shadcn (`style: radix-vega`, base `neutral`, lucide icons) in `src/components/ui/`. Aliases: `@/components`, `@/lib`, `@/hooks`, `@/components/ui`.

### Providers

`src/providers/index.tsx` wraps app with `SessionProvider`, `QueryClientProvider`, `NuqsAdapter`, `TooltipProvider`, `ToastContainer`. Mounted from `src/app/layout.tsx` after `getServerSession(authOptions)`.

### State stores (Zustand)

- `src/stores/wallet.ts` — local Arkade wallet state (Wallet, addresses, balance, custom VTXO scripts).
- `src/stores/profile.ts` — owns Arkade SDK provider construction (`ExpoArkProvider`, `ExpoIndexerProvider`, `BoltzSwapProvider`, `VtxoManager`, `ArkadeSwaps`). `setAccount(account)` derives privkey from mnemonic and constructs Wallet. Reads `NEXT_PUBLIC_ARK_OPERATOR_URL` and `NEXT_PUBLIC_BOLTZ_SWAP_PROVIDER`.

### Validators

Zod schemas in `src/validators/index.ts`. Reused on both client (form validation) and server (`schema.parse(body)` in route handlers). All signed-payload schemas include `signature: z.string().min(1)`.

## Environment

Required (see `.env.example` + `.env.local`):

- `NEXTAUTH_URL`, `NEXTAUTH_SECRET` — auth-options throws at import time if `NEXTAUTH_SECRET` missing.
- `ADMIN_MNEMONIC`, `ADMIN_PASSPHRASE` — server-only; derive the platform admin pubkey. `ADMIN_PASSPHRASE` must equal the admin's UI passphrase or no one is admin; omit/invalid `ADMIN_MNEMONIC` disables admin. → `docs/auth.md`.
- `NEXT_PUBLIC_ARK_OPERATOR_URL`, `NEXT_PUBLIC_BOLTZ_SWAP_PROVIDER` — Arkade wallet runtime.
- `DATABASE_URL` — required. Points to the PostgreSQL instance (`docker compose up -d postgres` uses the value in `.env.example`).
- `ENCRYPTION_KEY` — server-only, 32-byte base64. Encrypts `Key.code` at rest (AES-256-GCM) and derives the HMAC for `code_hash` dedup. Required for any stock upload/read. Protects against DB compromise, not a compromised app server.

- `MINIO_*` / `NEXT_PUBLIC_MINIO_URL` — S3-compatible storage (MinIO) for chat attachments (dispute evidence). Objects are stored encrypted at rest; the app proxies and decrypts chat attachment downloads through `GET /api/chat/[id]/attachment/[messageId]` (no presigned URLs). Storage client lives in `src/lib/storage`.

## .claude tooling

- `agents/` — `planner` (writes `.claude/tasks/<slug>.md`), `developer` (executes a task file), `versioner` (commit + version bump, never pushes, requires confirmation).
- `skills/fe-patterns` — frontend list/table patterns (rigid; see above).
- `skills/{shadcn-ui,tanstack-query,react-hook-form,conventional-commit-message-generator}` — domain skills.
- `tasks/` — planner output; agent reads from here when executing a task.
