# Glossary

New to the project? Read this first. These are the recurring terms in the docs and the code, each in
one plain sentence, with a link to the file that explains it in depth. Bitcoin/Arkade terms are kept
non-technical here — the mechanics live in the linked files.

---

**Admin dispute share** — an optional extra cut the platform admin can take for arbitrating a
dispute (`ADMIN_DISPUTE_SHARE_PERCENT`, default 0). Separate from the platform fee.
→ [escrow/fees.md](./escrow/fees.md)

**Antigone** — this project: a marketplace for software license keys where you log in with a
cryptographic key instead of a password, and payments are held in a trustless escrow on Ark (a Bitcoin
layer-2) until the trade resolves. → [README.md](./README.md)

**Arbiter** — the role the admin plays inside an escrow: a neutral third party who can co-sign a
payout only when there is a dispute, and only toward the outcome the admin ruled. The arbiter is the
same identity as the platform admin. → [escrow/dispute.md](./escrow/dispute.md)

**Arkade-OS** — the implementation of the **Ark** protocol (a Bitcoin layer-2) the escrow is built on.
It lets funds move instantly and cheaply _on Ark_ (off-chain) while staying anchored to Bitcoin, with
an _on-chain_ "exit" to Bitcoin L1 as a fallback. In these docs **"on Ark"** means a layer-2
transaction (escrow, payments, release, settlement); **"on-chain"** is reserved for true Bitcoin L1 —
the unilateral exit, onboarding/offboarding, and Lightning↔Ark swaps. → [escrow.md](./escrow.md)

**arkTx** — the off-chain transaction that actually moves escrow funds (e.g. paying the seller on
release). It is built and signed in the browser and submitted to the operator.
→ [escrow/release.md](./escrow/release.md)

**ASP (Arkade Service Provider) / operator** — the Arkade server (`NEXT_PUBLIC_ARK_OPERATOR_URL`) that
co-signs off-chain transactions and runs the wallet network layer. It cannot move escrow funds alone.
Login and most features keep working even when the ASP is unreachable. → [account.md](./account.md)

**BIP39 mnemonic** — the 12-word seed phrase that, together with your passphrase, derives your private
key. The mnemonic alone is not enough to log in. → [auth/keys-vault.md](./auth/keys-vault.md)

**Checkpoint** — an intermediate Arkade transaction that binds a spend to the exact escrow funds being
spent. The signing flows pass checkpoints between buyer, seller, admin, and operator so no party can
swap in funds from a different escrow. → [escrow/release.md](./escrow/release.md)

**Collaborative path** — an escrow spend that the operator co-signs, so it settles instantly
off-chain. The happy-path release and dispute settlements use collaborative paths. Its opposite is the
exit path. → [escrow/contract.md](./escrow/contract.md)

**Dust** — the smallest amount a Bitcoin output is allowed to hold. The platform fee adds the dust
threshold to itself so the fee can stand as its own valid output. → [escrow/fees.md](./escrow/fees.md)

**ECIES / CEK / MessageKey** — the chat encryption stack: each message is encrypted once with a
random content key (CEK), and that CEK is wrapped (ECIES) once per recipient into a `MessageKey` row.
The server stores only ciphertext. → [crypto/messaging.md](./crypto/messaging.md)

**Escrow** — the Ark contract that locks the buyer's payment until the trade resolves. Every
order has one. No single party (buyer, seller, admin, operator) can move the funds alone.
→ [escrow.md](./escrow.md)

**Exit path (CSV)** — an escrow spend that does **not** need the operator, used as a fallback if the
operator disappears or censors. It is delayed by a CSV timelock (`unilateralExitDelay`) so the
collaborative path always gets priority. → [escrow/contract.md](./escrow/contract.md)

**Favoured party** — in a dispute, the side (buyer or seller) the admin ruled in favour of. Only the
favoured party can drive the settlement on Ark, using the matching arbiter path.
→ [escrow/dispute.md](./escrow/dispute.md)

**Key (license key)** — the good being sold: a license code belonging to a product and a seller, with
a price in satoshi. Its code is encrypted at rest. → [shop.md](./shop.md) ·
[crypto/at-rest.md](./crypto/at-rest.md)

**Leaf** — one allowed way to spend the escrow, encoded as a branch (script) in the taproot tree. The
escrow has 6 spend leaves plus 1 unspendable commitment leaf.
→ [escrow/contract.md](./escrow/contract.md)

**NUMS commitment (leaf 6)** — a 7th, deliberately unspendable leaf tweaked by a per-order random
nonce. Its only job is to make every order's escrow address unique while keeping the 6 real spend
paths identical. → [escrow/contract.md](./escrow/contract.md)

**Order vs Escrow** — two records that advance in parallel: the **order** is the trade as the user
sees it (pending, completed, disputed…), the **escrow** is where the money actually is
(awaitingFunds, fundLocked, completed…). → [lifecycle.md](./lifecycle.md)

**Overfunding** — when the buyer locks more than the required amount into the escrow. Dispute
settlement returns the surplus to the buyer so the transaction stays balanced.
→ [escrow/fees.md](./escrow/fees.md)

**Passphrase ("13th word")** — a secret you choose that is mixed into key derivation on top of the
12-word mnemonic, and is also the admin's gate. You need both mnemonic and passphrase to log in;
neither is recoverable. → [auth/keys-vault.md](./auth/keys-vault.md)

**Platform fee** — the marketplace's cut (`PLATFORM_FEE_PERCENT`, default 1%), a surcharge the buyer
pays on top of the item price at checkout. Non-refundable. → [escrow/fees.md](./escrow/fees.md)

**Replay-guard** — the in-memory store of used nonces that stops a captured signed request from being
replayed within its freshness window. → [crypto/signing.md](./crypto/signing.md)

**Reservation** — a short-lived (10-minute) hold a buyer places on a key while it sits in their cart,
so two buyers can't check out the same key. → [account/cart.md](./account/cart.md)

**Satoshi (sat)** — the unit all prices are in: an integer, no decimals. Format with `formatPrice()`,
never with a currency symbol. → [README.md](./README.md)

**Schnorr signature** — the secp256k1 signature scheme used for both login (challenge–response) and
signing every mutation. Private keys never leave the browser.
→ [crypto/signing.md](./crypto/signing.md)

**Signed envelope** — the canonical message (method + path + timestamp + nonce + payload) that the
client signs for every mutation, binding the request to one endpoint and one short time window.
→ [crypto/signing.md](./crypto/signing.md)

**Stock** — a seller's inventory for a product at a given price tier; the product detail page groups
available keys into stocks by `(seller, price)`. → [shop.md](./shop.md) ·
[account/stocks.md](./account/stocks.md)

**Taproot tree** — the Bitcoin structure that holds all the escrow's allowed spend paths (leaves) at
once, revealing only the one actually used. → [escrow/contract.md](./escrow/contract.md)

**Vault** — the passphrase-encrypted blob in the browser's `localStorage` that stores your mnemonic;
unlocking it (re-entering the passphrase) reconstitutes your identity after a reload.
→ [auth/keys-vault.md](./auth/keys-vault.md)

**VTXO (Virtual Transaction Output)** — Arkade's off-chain equivalent of a Bitcoin UTXO: a chunk of
locked value. The escrow's funds are VTXOs; they expire at the Arkade batch expiry, which is why a
trade must resolve before then. → [escrow/release.md](./escrow/release.md)
