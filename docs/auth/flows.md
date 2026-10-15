# Authentication flows

Endpoints and verification steps of the auth flows. Key derivation and the vault are in
[keys-vault.md](./keys-vault.md); the signing primitives in [crypto/signing.md](../crypto/signing.md).

## API and entities

| Component        | Path                                                                  |
| ---------------- | --------------------------------------------------------------------- |
| Challenge        | `src/app/api/auth/challenge/route.ts`                                 |
| Login (NextAuth) | `src/app/api/auth/[...nextauth]/route.ts` + `src/lib/auth-options.ts` |
| Registration     | `src/app/api/auth/register/route.ts`                                  |
| Entities         | `Account`, `Challenge` (`prisma/schema.prisma`)                       |

## Registration — `POST /api/auth/register`

The route is wrapped in `signedRoute` with signer `body-pubkey` (see [crypto/signing.md](../crypto/signing.md)):
the client sends the standard v2 signed envelope (`postSigned("/auth/register", …)`, signature/ts/nonce
in headers) signed with the freshly derived private key; no session exists yet.

1. The envelope is verified against the `pubkey` inside the body. Missing headers / invalid signature
   / `pubkey` ≠ signer → 401; replayed nonce → 409 (so an old captured registration can no longer
   revert a username).
2. Body `{ pubkey, username }` validated with `registerSchema` (`username` ≥ 2 characters;
   the `create` form requires ≥ 6 client-side) → 422 otherwise.
3. **In-memory** rate limit (5/min per IP, falling back to the pubkey) → 429.
4. `upsert` of the `Account` row by `pubkey` (creates or updates `username`); DB error → 500.

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

Sign in from the UI: the `useLoginMutation` hook
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

## NextAuth session

- `CredentialsProvider` in `src/lib/auth-options.ts`, `jwt` strategy, `maxAge` **24h**.
- `jwt` callback: copies `token/pubkey/username` from `user`; reads the admin pubkey from
  `getAdminPubkey()` (the memoized, validated `ADMIN_PUBKEY` env — a public key, no derivation) and
  sets `token.isAdmin = (adminPubkey === token.pubkey)` on every invocation of the callback (always
  `false` when `ADMIN_PUBKEY` is missing/invalid).
- `session` callback: propagates `token`, `pubkey`, `username` and `isAdmin` onto
  `session`/`session.user` (default `isAdmin: false`).

## Notes / technical debt

- Application JWT expiry (1h) vs NextAuth session (24h): verify the alignment if relevant.
