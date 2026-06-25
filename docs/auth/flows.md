# Authentication flows

Endpoints and verification steps of the auth flows. Key derivation and the vault are in
[keys-vault.md](./keys-vault.md); the signing primitives in [crypto/signing.md](../crypto/signing.md).

## API and entities

| Component          | Path                                                                  |
| ------------------ | --------------------------------------------------------------------- |
| Challenge          | `src/app/api/auth/challenge/route.ts`                                 |
| Login (NextAuth)   | `src/app/api/auth/[...nextauth]/route.ts` + `src/lib/auth-options.ts` |
| Login (standalone) | `src/app/api/auth/login/route.ts`                                     |
| Registration       | `src/app/api/auth/register/route.ts`                                  |
| Entities           | `Account`, `Challenge` (`prisma/schema.prisma`)                       |

## Registration — `POST /api/auth/register`

1. Body `{ pubkey, username, signature }` validated with `registerSchema` (`username` ≥ 2 characters;
   the `create` form requires ≥ 6 client-side).
2. Verifies the Schnorr signature over `"${username} ${pubkey}"`. Invalid signature → 401.
3. `upsert` of the `Account` row by `pubkey` (creates or updates `username`); DB error → 500.

No challenge required. It is the same route used both by `create` (generated mnemonic) and by
`restore` (provided mnemonic).

## Challenge — `POST /api/auth/challenge`

1. Body `{ pubkey }` validated with `challengeSchema`.
2. **In-memory** rate limit: 10 requests/min per pubkey (`src/lib/auth/rate-limit.ts`, does not
   survive restarts nor scale across multiple instances) → 429 when exceeded.
3. Generates a `nonce` (32 hex bytes), expiry **30 seconds**.
4. Deletes expired challenges, then `upsert` of the `Challenge` row by pubkey.
5. Returns the entire saved `Challenge` row (`{ pubkey, nonce, expiry }`).

## Login (the real UI flow) — NextAuth `[...nextauth]`

Sign in from the UI does **not** use `/api/auth/login`: the `useLoginMutation` hook
(`src/hooks/accounts.ts`) decrypts the mnemonic from the `vault` with the passphrase
(`decryptMnemonic`), derives the privkey with the passphrase as the 13th word, obtains a nonce from
`/api/auth/challenge`, signs `"${nonce} ${pubkey}"` with that privkey, and calls
`signIn("credentials", …)`. Verification happens in `authorize()` (`src/lib/auth-options.ts`):

1. `loginSchema` validates `{ pubkey, nonce, signature }`.
2. Fetches the `Challenge` by `nonce`; checks existence, matching `pubkey`, and that it is not expired
   (otherwise throw → credentials error).
3. Verifies the Schnorr signature over `"${nonce} ${pubkey}"`.
4. **Deletes the challenge** (single-use; a second attempt → "Challenge already consumed").
5. Verifies that the `Account` exists (`"Account not found"` otherwise).
6. Issues an **HS256** JWT via `jose` with `{ sub: pubkey, username, iat, exp }`, **1h expiry**,
   signed with `NEXTAUTH_SECRET`, and returns it in `user.token`.

On success, `useLoginMutation` calls `profileStore.setAccount({ username, pubkey, privateKey })`
(building the Arkade wallet/provider from the already-unlocked privkey) and redirects to `/`.

## Login (standalone route) — `POST /api/auth/login`

A separate route that replicates the verification steps of the NextAuth flow, but does **not** check
the existence of the `Account` and issues a JWT with `{ sub: pubkey, iat, exp }` (without `username`),
returned as `text/plain`. It is currently not the path used by the UI (duplication to be consolidated
with `auth-options.ts`).

## NextAuth session

- `CredentialsProvider` in `src/lib/auth-options.ts`, `jwt` strategy, `maxAge` **24h**.
- `jwt` callback: copies `token/pubkey/username` from `user`; derives the admin pubkey from
  `ADMIN_MNEMONIC` and sets `token.isAdmin = (adminPubkey === token.pubkey)`. The derivation happens
  **on every invocation of the callback**, not just once at startup.
- `session` callback: propagates `token`, `pubkey`, `username` and `isAdmin` onto
  `session`/`session.user` (default `isAdmin: false`).

## Notes / technical debt

- There are **two login implementations** (`/api/auth/login` and `authorize` in `auth-options.ts`)
  with misaligned JWTs (one without `username` and without the account check): to be consolidated.
- The admin pubkey is re-derived from the mnemonic on every `jwt` callback (caching at startup is
  possible); also, some intermediate variables have unclear naming.
- Application JWT expiry (1h) vs NextAuth session (24h): verify the alignment if relevant.
