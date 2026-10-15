# Request signing

## Schnorr auth

Authentication is passwordless via **Schnorr signatures over secp256k1** (`@noble/curves`). The
privkey is derived client-side from the BIP39 mnemonic + passphrase (see
[auth/keys-vault.md](../auth/keys-vault.md)) and never leaves the browser. The challenge–response and
registration flows are in [auth/flows.md](../auth/flows.md).

## Signed mutations

Every `POST`/`PUT`/`PATCH`/`DELETE` on `/api/*` that modifies data is **signed** by the client,
checked by the server, and **persisted** as evidence:

- Client: `postSigned()` / `requestSigned()` for JSON bodies and `uploadSigned()` for raw bytes
  (`src/lib/auth/signed-request.ts`).
- Server: **`signedRoute({ schema, signer, ... })`** (`src/lib/auth/signed-route.ts`) is the single
  entry point; a route exports it instead of a bare handler. There is no other verification helper.
- Gate: `src/proxy.ts` rejects any mutating `/api/*` request lacking the signature headers
  (fail-closed), before the route runs.
- Zod schema of the payload: the **domain payload only**, no `signature` field
  (`src/validators/index.ts`).

### Canonical envelope (v2)

The signature covers the envelope `{ v: 2, method, path, ts, nonce, bodySha256 }`
(`src/lib/auth/signed-envelope.ts`, fixed field order), serialized with `JSON.stringify`:

- `path` is **pathname + query string**, exactly as sent (the client normalises it through `URL`);
- `bodySha256` is the hex SHA-256 of the **raw request body bytes** (empty body → hash of the empty
  string). The client serializes the JSON once, hashes that exact string, and sends it untouched.

This:

- **binds** the signature to the endpoint (method + path + query), so it is not reusable on another
  route;
- **binds** it to the exact body, so any altered byte is rejected (works for JSON and raw binary);
- **expires** after `SIGNED_REQUEST_TTL_MS` (120 s); a client clock ahead of the server by more than
  `SIGNED_REQUEST_CLOCK_SKEW_MS` (5 s) is rejected too;
- is **single-use**: the nonce is stored in `signed_action.nonce` (unique), see below.

The signature, timestamp and nonce travel in **headers** — `x-antigone-signature`,
`x-antigone-timestamp`, `x-antigone-nonce` — and the body carries no signature metadata.

### `signedRoute` pipeline

1. **Auth gating** by signer: `session` (logged-in user), `admin` (`requireAdminRoute`: non-admin →
   403 before any verification), `body-pubkey` (the `pubkey` field in the JSON body — used by
   registration, where no session exists yet).
2. Read the headers (missing → 401 `Missing signature`) and the raw body (raw mode: capped by
   `maxBytes`, checked on `Content-Length` and on the bytes read → 413).
3. Freshness check → 401 `Request timestamp out of range`.
4. Rebuild the envelope from the request itself (method, `pathname + search`, body hash) and verify
   the Schnorr signature against the signer pubkey → 401 `Invalid signature`.
5. Insert the **`SignedAction`** row. Duplicate nonce → 409 `Replay detected`.
6. Validate the payload with the Zod schema → 422 (the `SignedAction` row is **kept**: it records an
   attempted, signed action).
7. Call the handler with `{ req, params, session, pubkey, payload | bytes, action }`. Domain columns
   that store a signature (`Chat.signature`, `Message.signature`, `Order.refundSignature`, the
   checkout signature reused on the order chat) are filled from `action.signature`, and the domain
   rows link to `action.id` (see [verification.md](./verification.md)).

Body modes: `json` (default; `schema` required) and `raw` (`body: "raw"`, `maxBytes`, handler gets
`bytes` + `contentType`). Raw mode is used by the chat attachment upload: the image is the request
body with its own `Content-Type`, the file name travels in the `name` query param, so both are
covered by `bodySha256` and the signed `path`.

### `SignedAction` — evidence and anti-replay

Every verified request is stored in `signed_action` (`pubkey`, `method`, `path`, `ts`, `nonce`,
`bodySha256`, `body`, `signature`, `createdAt`). It is both:

- **evidence** of what each user signed — the raw JSON body text is kept so that a third party can
  re-verify the record; raw binary bodies store only the hash;
- the **anti-replay store**: the unique `nonce` is enforced by Postgres, so replays are rejected
  across restarts and across instances. Nonces are kept forever (they are part of the evidence).

`signedRoute` still supports `storeBody: false` (only the hash is stored) for any future body that
carries a secret in plaintext, but **no endpoint uses it**: the stock upload (`POST /api/stocks`) now
carries only E2E ciphertext, so its body is persisted like all the others (see
[at-rest.md](./at-rest.md)). The seller's confirm/deliver bodies (wrapped keys) are stored too — they
are the evidence of what was delivered.

Domain rows reference the action behind them by foreign key (`Message`, `Order` — checkout, confirm/
delivery, dispute, verdict —, `KeyCodeKey`; the handlers fill them from `action.id`), and the API
returns those actions so the **browser re-verifies** them: see
[verification.md](./verification.md). The existing signature columns keep being filled.

### Unsigned endpoints

Only `POST /api/auth/challenge` and the NextAuth internals (`/api/auth/callback/*`, `signout`,
`_log`, `csrf`, `session`) are exempt from the gate: they are the login challenge–response itself
(pre-session) and already prove key possession. `/api/auth/register` is signed like everything else.

### Error codes

| Status | Error                            | Cause                                                                |
| ------ | -------------------------------- | -------------------------------------------------------------------- |
| 401    | `Missing signature`              | A signature header is absent (`proxy.ts` or `signedRoute`)           |
| 401    | `Invalid signature`              | Bad signature, body altered, or signed for another method/path/query |
| 401    | `Request timestamp out of range` | Older than the TTL or future-dated beyond the skew                   |
| 403    | `Forbidden`                      | `admin` signer used by a non-admin session                           |
| 409    | `Replay detected`                | Nonce already present in `signed_action`                             |
| 413    | route-specific                   | Raw body over `maxBytes`                                             |
| 422    | first Zod issue                  | Signature valid, payload fails the schema                            |

> Admin mutations use the `admin` signer: the signature is verified against the admin session's
> pubkey (see [admin.md](../admin.md) and admin identity in [auth.md](../auth.md)).

> ⚠️ The rate limit of `/api/auth/challenge` and `/api/auth/register`
> (`src/lib/auth/rate-limit.ts`) is still **in-memory**: it does not survive restarts nor scale across
> multiple instances.
