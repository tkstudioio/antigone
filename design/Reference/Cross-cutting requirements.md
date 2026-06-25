---
tags: [reference, cross-cutting, a11y, responsive]
---

# Cross-cutting requirements

Requirements that apply across all [[README|domains]].

## Responsive & devices

- The product must work on **desktop and mobile**.
- Several views show **dense data lists** (orders, stock, keys, disputes) next to more **synthetic**
  views (order detail, wallet). On small screens decide the **information priority**: what stays
  visible, what can collapse, what's reached later. _(Which patterns — tables, cards, other — is the
  design's choice.)_
- **Critical info that must stay legible even in little space:** **order status + funds status**,
  **price/total in sats**, **who the counterparty is**, and **what the next move is**.

## Accessibility & feedback

- **Basic accessibility:** adequate contrast, keyboard navigation, alt text for images, adequate
  target sizes. States (available/sold-out, open/closed, favorited/not) must **not rely on color
  alone**.
- **Irreversible or high-impact actions** — clearly flagged and confirmed:
  - **recovery-phrase backup** at creation (shown once) — see [[01 — Authentication and identity]];
  - **delivery confirmation** by the seller (starts the funds release) — see [[04 — Orders, detail and chat]];
  - **verdict conclusion/update** by the admin (moves money) — see [[07 — Admin area and disputes]];
  - **opening a dispute**;
  - **deleting keys/stock** — see [[05 — Stock management]].
- **Async operations** (payment, release, settlement, wallet send) — need **in progress**,
  **success**, **failure** states, with honest messages about timing.
- **Real-time / polling updates** — some views update on their own (chat, dispute lists, order detail
  during release). Design how to signal an update without disorienting.
- **Notifications / confirmations** — important events (payment received, order confirmed, verdict
  issued) deserve visible feedback; errors must be communicated comprehensibly, never as silent state.

---

Related: [[README]] · [[Product overview and principles]]
