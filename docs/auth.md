# Domain `(auth)` — Authentication

**Passwordless** authentication based on Schnorr signatures over secp256k1. The private key is derived
in the browser from a BIP39 mnemonic + passphrase and **never leaves the client**. The server only knows
`{ pubkey, username }` (the `Account` entity).

## Pages

- `(auth)/login` — lists the accounts present in `localStorage` via `useAccountsList`
  (`src/hooks/accounts.ts`), **reactive** (backed by `useLocalStorage`): creation, restore and
  removal update the list instantly. Selecting an account opens the `PassphraseDialog` that
  asks for the passphrase; each entry also has a removal action (`useRemoveAccount`). At the bottom,
  `LoginActions` links to creation/restore.
- `(auth)/create` — form → username + passphrase (with confirmation), generates a new mnemonic, registers
  the account, **encrypts the mnemonic with the passphrase** and saves the `StoredAccount`. Shows the mnemonic
  **only once** for backup (warning: mnemonic + passphrase both required and not
  recoverable).
- `(auth)/restore` — `RestoreAccountForm` → rebuilds an account from the provided mnemonic + passphrase,
  (re)registers it, saves the encrypted `StoredAccount` and **redirects to `/login`**.

## Client → API path

| Action        | Page / Component                                                      | Hook                                        | API                                            |
| ------------- | --------------------------------------------------------------------- | ------------------------------------------- | ---------------------------------------------- |
| Create account| `create/page.tsx`                                                     | `accounts.ts` (`useCreateAccountMutation`)  | `POST /api/auth/register`                      |
| Restore       | `restore/page.tsx` → `restore-account-form.tsx`                       | `accounts.ts` (`useRestoreAccountMutation`) | `POST /api/auth/register`                      |
| Login         | `login/page.tsx` → `accounts-list-item.tsx` → `passphrase-dialog.tsx` | `accounts.ts` (`useLoginMutation`)          | `POST /api/auth/challenge` + NextAuth `signIn` |
| Unlock        | `wallet-auto-reconnect.tsx` → `unlock-dialog.tsx`                     | `wallet.ts` (`useWalletAutoReconnect`)      | — (rehydration / decrypt vault)                |
| Account list  | `login/page.tsx`                                                      | `accounts.ts` (`useAccountsList`)           | — (only `localStorage`)                        |

## Sub-flows (L3)

- **[auth/flows.md](./auth/flows.md)** — register, challenge, NextAuth login (real UI flow), standalone
  login, NextAuth session.
- **[auth/keys-vault.md](./auth/keys-vault.md)** — passphrase (13th word), PBKDF2 vault,
  `StoredAccount`/`UnlockedAccount`, unlock after reload, security notes.

The Schnorr signing primitives are in [crypto/signing.md](./crypto/signing.md).

## Independence from the ASP

Login and session **do not depend** on the Arkade server (ASP). The challenge/`signIn` and the
JWT/session callbacks (`auth-options.ts`) verify signature and nonce against the DB, without any call to the ASP. The
wallet unlock after reload (`UnlockDialog` → `setAccount`) sets the identity even if the ASP is
unreachable: the wallet initializes best-effort and auto-recovers when the ASP comes back. See
«Session ↔ ASP decoupling» in [account.md](./account.md). No ASP error causes automatic
sign-out.

## Admin identity

`ADMIN_MNEMONIC` + `ADMIN_PASSPHRASE` (server-only env) → admin pubkey derived via
`mnemonicToPrivateKey(ADMIN_MNEMONIC, ADMIN_PASSPHRASE)` + `derivePubkey`. **`ADMIN_PASSPHRASE` must
match the passphrase the admin uses in the UI** (it is their 13th word): otherwise the derived pubkey
does not match the one used at login and no one obtains `isAdmin`. The same identity is used at
every server point that derives the admin key (the `isAdmin` check in `auth-options.ts`, the escrow
arbiter pubkey at checkout, dispute co-signing in `mutations-dispute.ts`). If
`ADMIN_MNEMONIC` is omitted or invalid → `console.error` and admin disabled (no one obtains
`isAdmin`). See also [admin.md](./admin.md).
