# Antigone — Design Documentation

Map of the design documentation. The original monolithic [[report-requisiti-design|requirements report]]
has been split into **domains**, each with its own **technical flow** + a **Mermaid flowchart**,
meant as the base for brainstorming wireframes in Figma.

> [!tip] How to read
>
> 1. Start with the **Foundations** (vocabulary, actors, state machine): without this base many
>    screens are incomprehensible.
> 2. Then dive into the **Domains**: each is self-contained and links to what it needs.
> 3. The **Reference** (data & entities, cross-cutting requirements) is consulted on demand.

## 🧱 Foundations (read first)

- [[Product overview and principles]] — what Antigone is, the problem it solves, UX principles, domain primer.
- [[Personas and actors]] — the four actors and what each can do.
- [[State machine — order and escrow]] — **the backbone**: the two state planes (order = user-facing,
  escrow = where the money is) and how they advance.
- [[Glossary]] — quick vocabulary + status/outcome enums.

## 🗂️ Domains (flow + flowchart)

| #   | Domain                               | Views covered                                        |
| --- | ------------------------------------ | ---------------------------------------------------- |
| 01  | [[01 — Authentication and identity]] | Login, Create, Restore, Unlock                       |
| 02  | [[02 — Public storefront]]           | Home, Catalog, Product detail, Seller detail         |
| 03  | [[03 — Cart and checkout]]           | Cart / checkout                                      |
| 04  | [[04 — Orders, detail and chat]]     | Orders (buyer/seller), Order detail, Chat, Favorites |
| 05  | [[05 — Stock management]]            | Stock list, Product stock detail                     |
| 06  | [[06 — Wallet]]                      | Wallet (user and admin)                              |
| 07  | [[07 — Admin area and disputes]]     | Dispute list, Dispute detail, Verdict, Admin wallet  |

## 📚 Reference

- [[Data and entity catalog]] — which data exists, what it means, what is showable (🟢/🟡/🔴).
- [[Cross-cutting requirements]] — responsive, accessibility, feedback, irreversible actions.
