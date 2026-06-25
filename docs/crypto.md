# Cryptography (cross-cutting)

Antigone's cryptographic primitives, shared across the domains. The server never sees private keys
nor the plaintext of the messages. Three distinct areas, one per L3 file.

## Where the code lives

- `src/lib/auth/signed-request.ts`, `verify-signed-json-body.ts`, `signed-envelope.ts`,
  `replay-guard.ts` — signing and verification of mutations.
- `src/lib/crypto/ecies.ts`, `message-envelope.ts` — E2E message encryption.
- `src/lib/crypto/symmetric.ts` — AES-256-GCM at-rest (license key, attachments).

## L3 index

| File                                         | Content                                                                                                  |
| -------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| [crypto/signing.md](./crypto/signing.md)     | Schnorr auth, signed mutation envelope (method+path+ts+nonce+payload), freshness and anti-replay.        |
| [crypto/messaging.md](./crypto/messaging.md) | E2E encryption of chat messages (ECIES + CEK + `MessageKey`), `grant-admin`, wrapping in a dispute.      |
| [crypto/at-rest.md](./crypto/at-rest.md)     | At-rest encryption: license key codes (AES-GCM + `code_hash`) and MinIO attachments (proxy/decryption).  |

> The derivation of user keys (BIP39 mnemonic + passphrase → privkey) and the local **vault**
> are part of auth: see [auth/keys-vault.md](./auth/keys-vault.md).
