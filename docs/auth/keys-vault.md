# Keys, passphrase and local vault

The private key is derived in the browser from a BIP39 mnemonic **plus a passphrase** chosen by the
user (BIP84 path `m/84'/0'/0'/0/0`, `mnemonicToPrivateKey(mnemonic, passphrase)` in
`src/lib/utils.ts`) and **never leaves the client**.

## Passphrase (13th word) — dual role

The passphrase plays **two roles with a single secret**:

1. **BIP39 13th word** — it feeds into `mnemonicToSeedSync(mnemonic, passphrase)`, thus changing the
   derived keys. A stolen mnemonic on its own is useless (it derives a different wallet/pubkey); a
   different mnemonic + passphrase → distinct accounts.
2. **Encryption key** — from it is derived, via PBKDF2-SHA256 (600k iterations) → AES-GCM-256, the key
   with which the mnemonic is encrypted before being saved. See `src/lib/auth/vault.ts`
   (`encryptMnemonic`/`decryptMnemonic`).

The passphrase is **never persisted**. After unlocking, **only the derived privkey** is kept (never
the mnemonic in cleartext).

## Local storage

- **`localStorage`** key `"accounts"` — array of **`StoredAccount`** (`src/types/account.ts`):
  `{ username, pubkey, vault: { ciphertext, iv, salt, iterations } }`. No mnemonic in cleartext, no
  passphrase.
- **In memory** (profile store) — **`UnlockedAccount`** `{ username, pubkey, privateKey }`.
- **`sessionStorage`** key `"unlocked-account"` — cache of the `UnlockedAccount` to survive reloads
  in the same tab (`src/lib/auth/session-vault.ts`).

The server only knows `{ pubkey, username }` (entity `Account`): it neither receives nor stores
mnemonics, passphrases or private keys.

## Unlock after reload

The tab cache is written centrally by `setAccount` (`src/stores/profile.ts`) — this applies both to
login and to manual unlock — and cleared by `clear()`.

`useWalletAutoReconnect` (`src/hooks/wallet.ts`) returns a discriminated state `none | rehydrating | locked`:

- **`rehydrating`** — authenticated session, no `account` in memory, but `sessionStorage` holds an
  unlocked account with a `pubkey` equal to the session's: `setAccount` is invoked **silently**
  (rebuild of wallet/provider) without asking for the passphrase. This is the case of reload/navigation
  with the tab open. `UnlockDialog` shows nothing (no flash).
- **`locked`** — no valid cache (new tab, after closing the tab/browser, or cache from another
  account): `UnlockDialog` (`src/components/unlock-dialog.tsx`, mounted globally by
  `WalletAutoReconnect`) asks for the passphrase, decrypts the vault, re-derives the privkey and calls
  `setAccount`. Alternatively the user can sign out (`signOut`).
- **`none`** — not authenticated, already unlocked, or no local account matches the session. On
  `unauthenticated` the hook also clears the tab cache (covering the `signOut`s that do not go through
  `clear()`, e.g. the admin area).

If `setAccount` fails during rehydration (corrupted cache), `sessionStorage` is cleared and it falls
back to the dialog. Signed mutations fail with "Wallet not available" until the account is
(re)unlocked.

> **Security:** the `privkey` ends up in `sessionStorage` in cleartext — scoped to the tab, not sent
> to the server, deleted on close. The exposure is equivalent to what already exists in memory, with
> the addition of being readable from storage while the tab is open (XSS risk limited to the tab
> session). Encrypting it would add no real protection (the key would live in the same JS context).
> The cleartext mnemonic is never persisted.

> **Technical debt:** offline brute-force of the vault remains theoretically possible if the
> passphrase is weak (mitigated by the 600k PBKDF2 iterations; consider Argon2id for greater
> robustness).
