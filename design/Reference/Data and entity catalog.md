---
tags: [reference, data, entities]
---

# Data and entity catalog

What you **can** show and what it **means**. Visibility legend:
**🟢 showable to the user · 🟡 showable only to the entitled party / sensitive · 🔴 internal
plumbing, never show** (signatures, cryptographic protocol data).

> [!note] Presentation conventions
> Monetary amounts in **satoshi** (`1,234 sats`); absent values → `—`; **public keys** (`pubkey`) are
> long strings → present them humanely (username, truncation, copy).

## Account — a user's identity

| Field       | Vis. | Meaning                                                                     |
| ----------- | ---- | --------------------------------------------------------------------------- |
| `pubkey`    | 🟢   | Cryptographic identity (public key). The user's ID. Long string → humanize. |
| `username`  | 🟢   | User-chosen name. May not be unique: not a reliable identifier alone.       |
| `createdAt` | 🟢   | Registration date.                                                          |

## Product — the catalog card

| Field         | Vis. | Meaning                                                             |
| ------------- | ---- | ------------------------------------------------------------------- |
| `id`          | 🔴   | Technical identifier.                                               |
| `name`        | 🟢   | Product name.                                                       |
| `slug`        | 🟢   | Human-readable identifier used in the detail URL.                   |
| `description` | 🟢   | Description (may be missing → `—`).                                 |
| `rating`      | 🟢   | Average rating (may be missing → `—`). _(Staged; reviews feature.)_ |
| `imageUrl`    | 🟢   | Product image (may be missing → placeholder).                       |
| `createdAt`   | 🟢   | Insertion date.                                                     |

## Key — the license key (the good sold)

| Field           | Vis. | Meaning                                                                                                                        |
| --------------- | ---- | ------------------------------------------------------------------------------------------------------------------------------ |
| `id`            | 🔴   | Technical identifier.                                                                                                          |
| `productId`     | 🟢   | Which product it belongs to.                                                                                                   |
| `sellerPubkey`  | 🟢   | Who sells it (seller).                                                                                                         |
| `code`          | 🟡   | **The actual license code.** The good. Encrypted at rest; visible **only** to the entitled buyer, after the outcome. Else `—`. |
| `codeHash`      | 🔴   | Technical fingerprint for dedup. Never show.                                                                                   |
| `price`         | 🟢   | Price in satoshi.                                                                                                              |
| `reservedBy`    | 🟡   | Who reserved the key (cart).                                                                                                   |
| `reservedUntil` | 🟡   | Reservation expiry (~10 min timer).                                                                                            |
| `orderId`       | 🟡   | Which order it's tied to, if sold.                                                                                             |
| `buyerPubkey`   | 🟡   | The assigned buyer. **Determines who can see the code.**                                                                       |
| `refunded`      | 🟡   | Whether the key was refunded in a dispute.                                                                                     |
| `createdAt`     | 🟡   | When uploaded.                                                                                                                 |

> [!info] Key availability
> Depends on `orderId` (not sold) and the reservation (`reservedBy`/`reservedUntil`). A "**stock**" on
> the product detail is the set of available keys grouped by **(seller, price)**.

## Order — the user-side transaction

| Field                                       | Vis. | Meaning                                                                                                                   |
| ------------------------------------------- | ---- | ------------------------------------------------------------------------------------------------------------------------- |
| `id`                                        | 🟢   | Order identifier (showable as a reference).                                                                               |
| `buyerPubkey` / `sellerPubkey`              | 🟢   | The counterparties.                                                                                                       |
| `arbiterPubkey`                             | 🟡   | Associated admin/arbiter (relevant in dispute).                                                                           |
| `totalSats`                                 | 🟢   | Order total in satoshi.                                                                                                   |
| `platformFee`                               | 🟢   | Included platform fee (see Fees below).                                                                                   |
| `adminDisputeShare`                         | 🟡   | Arbitration share (only if there was a dispute with a share).                                                             |
| `status`                                    | 🟢   | **Order status**: `pending`/`completed`/`disputed`/`concluded`. _(`funded`/`refunded`/`cancelled` residual: don't show.)_ |
| `escrowAddress`                             | 🔴   | Technical reference to the escrow.                                                                                        |
| `refundAmount`                              | 🟢   | Amount refunded on dispute outcome (if any).                                                                              |
| `conclusionStatus`                          | 🟢   | Dispute outcome: `completed` / `partially_refunded` / `cancelled`.                                                        |
| `favouredRole`                              | 🟡   | Verdict-favoured party: `buyer` / `seller`.                                                                               |
| `refundSignature`                           | 🔴   | Protocol signature. Never show.                                                                                           |
| `createdAt` / `completedAt` / `concludedAt` | 🟢   | Key-moment dates (creation / completion / conclusion).                                                                    |

## Escrow — where the money actually is

| Field                                                         | Vis. | Meaning                                                                                                                                                             |
| ------------------------------------------------------------- | ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `address`                                                     | 🔴   | Technical escrow identifier.                                                                                                                                        |
| `nonce`                                                       | 🔴   | Protocol data (uniqueness).                                                                                                                                         |
| `buyerPubkey` / `sellerPubkey`                                | 🟢   | The parties.                                                                                                                                                        |
| `serverPubkey`                                                | 🔴   | Technical protocol data.                                                                                                                                            |
| `arbiterPubkey`                                               | 🟡   | The arbiter (relevant in dispute).                                                                                                                                  |
| `price`                                                       | 🟢   | Protected amount in satoshi.                                                                                                                                        |
| `platformFee`                                                 | 🟢   | Platform fee.                                                                                                                                                       |
| `exitDelay`                                                   | 🔴   | Technical contract parameter.                                                                                                                                       |
| `chatId`                                                      | 🔴   | Reference to the chat.                                                                                                                                              |
| `status`                                                      | 🟢   | **Funds status**: `awaitingFunds`/`fundLocked`/…/`completed`/`refunded`/`expiredSwept`. _(`partiallyFunded`/`buyerSubmitted` residual: don't show.)_                |
| `…SignedPsbt`, `…Checkpoints`, `…ArkTxid`, `disputeExitState` | 🔴   | **All cryptographic protocol plumbing** (partially-signed txs, checkpoints, tx ids…). **Never show.** Optionally an external explorer link for the txid, if useful. |
| `createdAt` / `fundedAt` / `releasedAt` / `settledAt`         | 🟢   | Money-moment dates (creation / payment / release / settlement). Good for a timeline.                                                                                |

> [!tip] For design, the escrow boils down to
> **`status`**, **`price` + `platformFee`**, the **funding state** (how much is actually locked) and
> the **dates**. Everything else is protocol.

## Chat / Message / MessageKey — the conversation

**Chat**

| Field       | Vis. | Meaning                                          |
| ----------- | ---- | ------------------------------------------------ |
| `id`        | 🔴   | Technical identifier.                            |
| `orderId`   | 🟡   | The order the chat belongs to.                   |
| `status`    | 🟢   | `open` / `closed`. When closed, no more writing. |
| `createdAt` | 🟢   | Opening.                                         |
| `signature` | 🔴   | Protocol signature.                              |

**Message**

| Field                                                  | Vis. | Meaning                                                                                                                      |
| ------------------------------------------------------ | ---- | ---------------------------------------------------------------------------------------------------------------------------- |
| `id`                                                   | 🔴   | Technical identifier.                                                                                                        |
| `chatId`                                               | 🔴   | Owning chat.                                                                                                                 |
| `message`                                              | 🟡   | The text. **End-to-end encrypted**: readable only by recipients (and the admin **only** in dispute).                         |
| `senderPubkey`                                         | 🟢   | Sender.                                                                                                                      |
| `isSystem`                                             | 🟢   | Whether it's a **system message** (automatic event, e.g. "dispute concluded…"): distinguish it visually from human messages. |
| `sentAt`                                               | 🟢   | Time.                                                                                                                        |
| `attachmentName` / `attachmentType` / `attachmentSize` | 🟢   | Attachment metadata (name, type, size). Images, max 5 MB.                                                                    |
| `attachmentKey`                                        | 🔴   | Internal storage reference (downloaded via authenticated path, not a direct URL).                                            |
| `signature`                                            | 🔴   | Protocol signature.                                                                                                          |

**MessageKey** — 🔴 entirely cryptographic plumbing (per-recipient encryption keys). **Never show.**
Mentioned only for completeness: it's the mechanism that makes messages readable by the right recipient.

## Fees — what composes a total

A total can break down into:

- **Item price(s)** (the sum of the keys).
- **Platform fee** (`platformFee`): a small percentage the **buyer** pays extra at checkout.
  **Non-refundable.**
- **Arbitration share** (`adminDisputeShare`): an **optional** cut the platform may keep **only** on a
  dispute. Separate from the platform fee. Often zero.
- **Overfunding:** if the buyer locks more than owed, on settlement the difference is returned.

## Staged entities (not yet active)

In the data model but **without an experience yet** — design opportunities.

**Favorite** (favorites / wishlist) — `accountPubkey` (the user), `productId` (the favorited product),
`createdAt`. → Enables a "save to favorites" function on products (see [[04 — Orders, detail and chat]]).

**Review** (seller reviews) — `reviewedPubkey` (who is reviewed, usually the seller), `reviewerPubkey`
(who reviews), `reviewerRole` (`seller`/`buyer`), `rating` (numeric), `message` (review text),
`escrowAddress` (the order/escrow justifying the review — you review after a real trade), `createdAt`.
→ Enables a **reputation** system feeding the product `rating` (see [[02 — Public storefront]]).

---

Related: [[Glossary]] · [[State machine — order and escrow]]
