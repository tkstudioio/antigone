# Request signing

## Schnorr auth

Authentication is passwordless via **Schnorr signatures over secp256k1** (`@noble/curves`). The
privkey is derived client-side from the BIP39 mnemonic + passphrase (see
[auth/keys-vault.md](../auth/keys-vault.md)) and never leaves the browser. The challenge–response and
registration flows are in [auth/flows.md](../auth/flows.md).

## Signed mutations

Every `POST`/`PATCH`/`DELETE` that modifies data is **signed** by the client and verified by the
server:

- Client: `postSigned()` (`src/lib/auth/signed-request.ts`).
- Server: `verifySignedJsonBody()` (`src/lib/auth/verify-signed-json-body.ts`); session guards
  `requireSessionRoute()` / `requireAdminRoute()` (`src/lib/auth/session.ts`).
- Zod schema of the payload: **always** includes `signature: z.string().min(1)`
  (`src/validators/index.ts`).

### Canonical envelope

The signature covers **method + path + timestamp + nonce + payload** (canonical envelope in
`src/lib/auth/signed-envelope.ts`). This:

- **binds** the signature to the endpoint (method + path), so it is not reusable on another route;
- **expires** after `SIGNED_REQUEST_TTL_MS` (120 s) — freshness window;
- is **single-use** (anti-replay via `src/lib/auth/replay-guard.ts`, in-memory, single-use nonce).

The client sends `_sigTs` and `_sigNonce` alongside the payload; the server uses them to reconstruct
the signed message and verify it against the caller's pubkey.

> Admin mutations are signed **with the admin key** and verified against the admin pubkey derived
> server-side (see [admin.md](../admin.md) and admin identity in [auth.md](../auth.md)).

> ⚠️ The replay-guard is **in-memory**: it does not survive restarts nor scale across multiple
> instances. The same applies to the rate limit of `/api/auth/challenge`
> (`src/lib/auth/rate-limit.ts`).
