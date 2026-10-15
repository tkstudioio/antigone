# Cryptography (cross-cutting)

Antigone's cryptographic primitives, shared across the domains. The server never sees private keys
nor the plaintext of the messages, and the browser does not trust the server for what a user signed or
what Ark can attest. Four distinct areas, one per L3 file.

## Where the code lives

- `src/lib/auth/signed-request.ts`, `signed-envelope.ts` (client + shared), `signed-route.ts`
  (`signedRoute`, server), `src/proxy.ts` (fail-closed header gate) — signing and verification of
  mutations; verified requests are persisted in `SignedAction`.
- `src/lib/crypto/ecies.ts`, `message-envelope.ts` — E2E message encryption.
- `src/lib/crypto/code-envelope.ts` — E2E license codes (seller encrypt, buyer/arbiter re-wrap, dedup hash).
- `src/lib/crypto/symmetric.ts` — AES-256-GCM at-rest (license key, attachments).
- `src/lib/auth/verify-signed-action.ts`, `src/lib/chat-chain.ts`, `src/lib/order-verification.ts`,
  `src/lib/arbiter-pin.ts`, `src/lib/ark/operator-signer.ts` — client-side verification of server data.

## L3 index

| File                                               | Content                                                                                                                            |
| -------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| [crypto/signing.md](./crypto/signing.md)           | Schnorr auth, signed mutation envelope v2 (method+path+ts+nonce+bodySha256), `signedRoute`, `SignedAction` evidence + anti-replay. |
| [crypto/messaging.md](./crypto/messaging.md)       | E2E encryption of chat messages (ECIES + CEK + `MessageKey`), `grant-admin`, wrapping in a dispute.                                |
| [crypto/at-rest.md](./crypto/at-rest.md)           | At-rest encryption: license key codes (AES-GCM + `code_hash`) and MinIO attachments (proxy/decryption).                            |
| [crypto/verification.md](./crypto/verification.md) | Client-side verification of server data: signed actions, chat hash chain, order terms and verdict, Ark facts, arbiter pin (TOFU).  |

> The derivation of user keys (BIP39 mnemonic + passphrase → privkey) and the local **vault**
> are part of auth: see [auth/keys-vault.md](./auth/keys-vault.md).
