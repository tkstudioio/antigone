# Antigone

Antigone is an open-source marketplace for digital goods — software license keys — built around a
simple idea: two strangers should be able to trade safely without having to trust each other, a
middleman, or even the platform itself. The buyer never has to pay before receiving their keys, and
the seller never has to hand over keys before being paid: every order's payment is locked in a
contract that no single party can move alone, and is released only when the trade resolves — or split
by a neutral verdict if it goes wrong. There are no passwords either: you hold a cryptographic key
that proves who you are, and it never leaves your browser.

## Why "Antigone"?

The name is borrowed from the heroine of Sophocles' tragedy. Antigone openly defies Creon's decree —
the law of the state — and buries her brother anyway, because she answers to a higher, unwritten law:
the moral law. She does it knowing it will cost her her life, and she does it regardless. The point is
not rebellion for its own sake, but the conviction that some principles stand above any authority's
command.

The project takes that conviction as its design rule. Here trust does not rest on an authority you
have to obey and hope is honest — it rests on cryptography and an open protocol that hold regardless of
who is in charge. No one — not the buyer, the seller, the Arkade operator, nor even the platform admin
— can move a trade's funds alone, and your identity is yours to hold rather than the platform's to
grant or revoke.

## Stack

- Next.js 16 (App Router) + React 19
- NextAuth (JWT session) with a custom Schnorr challenge–response flow
- Prisma ORM + PostgreSQL (`@prisma/adapter-pg`)
- TanStack React Query + custom hooks
- Arkade-OS SDK (`@arkade-os/sdk`) for the wallet and the on-Ark escrow
- shadcn/ui + Tailwind CSS

## Requirements

- Node `v22.22.2` (see `.nvmrc`)
- yarn
- PostgreSQL (a local instance is provided via `docker compose up -d postgres`)

## Getting started

### Run it locally (dev mode)

1. Copy `.env.example` to `.env` and fill in the secrets.
2. Install dependencies:
   ```bash
   yarn
   ```
3. Start PostgreSQL (optional, if you use the bundled one):
   ```bash
   docker compose up -d postgres
   ```
4. Generate the Prisma client and run migrations:
   ```bash
   yarn db:generate
   yarn db:migrate
   ```
5. (Optional) seed sample products:
   ```bash
   yarn db:seed
   ```
6. Start the dev server:
   ```bash
   yarn dev
   ```

## Documentation

The app is organised into **domains** — route groups under `src/app/`, each with its own layout:

- `(auth)` — passwordless authentication (Schnorr challenge–response).
- `(shop)` — public storefront: product catalog and detail.
- `(account)` — authenticated user area: cart, orders, seller stock, wallet, order chat.
- `(admin)` — platform moderation: disputes and chat.

The full docs live in [`docs/`](./docs/README.md) and are organised in **3 levels**, each adding
detail without repeating the one above:

- **L1 — [`CLAUDE.md`](./CLAUDE.md)**: orientation and architectural synthesis.
- **L2 — domain & cross-cutting files in `docs/`**: pages, entities, and `resource → endpoint →
backend` tables (e.g. [auth.md](./docs/auth.md), [shop.md](./docs/shop.md),
  [escrow.md](./docs/escrow.md)).
- **L3 — files in `docs/<area>/`**: the mechanics — algorithms, transactional steps, edge cases.

Start at **[docs/README.md](./docs/README.md)** for the full map, the request-flow diagram, and the
main buyer→seller→dispute journey. New to the domain vocabulary (VTXO, escrow leaf, the "13th word")?
Read the **[glossary](./docs/glossary.md)** first.

## License

[MIT](./LICENSE) © 2026 Michele Guidetti
