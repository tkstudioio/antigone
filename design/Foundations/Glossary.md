---
tags: [foundations, glossary]
---

# Glossary

## Quick vocabulary

| Term                       | In one sentence                                                                                                                                                       |
| -------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **License key (key)**      | The good being sold: a software product's license code, priced in satoshi. The "physical product" of the trade.                                                       |
| **Product**                | The catalog card (name, description, image) under which multiple sellers sell their keys.                                                                             |
| **Stock**                  | **One** seller's inventory for **one** product at **one** given price. The same product card can have multiple sellers and price tiers.                               |
| **Order**                  | The transaction as the user sees it (pending, completed, disputed…).                                                                                                  |
| **Escrow**                 | Where the money _actually_ is (awaiting funds, locked, released, refunded…). Order and escrow are **two distinct things** — see [[State machine — order and escrow]]. |
| **Satoshi (sat)**          | The unit of all prices: an integer, no decimals.                                                                                                                      |
| **Reservation**            | A temporary (10-minute) hold a buyer places on a key while it's in the cart, so two people can't buy the same key.                                                    |
| **Dispute**                | The claim procedure leading to the admin's arbitration.                                                                                                               |
| **Passphrase / 13th word** | The user-chosen secret: acts as a password and, together with the recovery phrase, grants access to the identity. Needed at login and to unlock it.                   |
| **Recovery phrase**        | The 12 words generated at creation. Together with the passphrase they reconstruct the identity. Shown only once; not recoverable.                                     |
| **Platform fee**           | A small percentage the **buyer** pays on top at checkout. **Non-refundable.**                                                                                         |
| **Arbitration share**      | An optional cut the platform may keep **only** on a dispute. Separate from the platform fee. Often zero.                                                              |
| **Overfunding**            | If the buyer locks more than owed, on settlement the difference is returned to them.                                                                                  |

## Status & outcome enums

| Enum                                     | Values                                                                                                                                          | Meaning                                                                                                           |
| ---------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| **Order status**                         | `pending` · `completed` · `disputed` · `concluded`                                                                                              | See [[State machine — order and escrow]]. (`funded`, `refunded`, `cancelled` exist but are **residual**, unused.) |
| **Escrow status**                        | `awaitingFunds` · `fundLocked` · `sellerReady` · `buyerCheckpointsSigned` · `completed` · `disputed` · `settling` · `refunded` · `expiredSwept` | See [[State machine — order and escrow]]. (`partiallyFunded`, `buyerSubmitted` exist but are **residual**.)       |
| **Dispute outcome** (`conclusionStatus`) | `completed` · `partially_refunded` · `cancelled`                                                                                                | No refund (seller keeps all) · partial refund · full refund (buyer gets everything back).                         |
| **Favoured party** (`favouredRole`)      | `buyer` · `seller`                                                                                                                              | Who the verdict favours.                                                                                          |
| **Chat status**                          | `open` · `closed`                                                                                                                               | Conversation writable or read-only.                                                                               |
| **Reviewer role** (`reviewerRole`)       | `seller` · `buyer`                                                                                                                              | Who left a review (feature staged, see [[Data and entity catalog]]).                                              |

---

See also: [[Product overview and principles]] · [[Data and entity catalog]]
