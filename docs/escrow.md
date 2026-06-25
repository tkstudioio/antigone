# Arkade-OS escrow

## Why there is an escrow

A buyer and a seller who have never met don't trust each other: the buyer doesn't want to pay before
receiving the keys, and the seller doesn't want to hand over the keys before being paid. The
**escrow** breaks the standoff. It is an Ark contract (Arkade-OS — a Bitcoin layer-2) that **locks the
buyer's payment** the moment they pay, and can only release it in a few pre-agreed ways. The key
property:

> **No single party — buyer, seller, admin, or Arkade operator — can move the escrow funds alone.**

On a normal trade, buyer and seller (with the operator) release the funds together. If they disagree,
the admin acts as a neutral arbiter, but still cannot take the money alone. And if the operator
disappears, an on-chain "exit" path lets the parties recover their funds without it — so the operator
is not a single point of failure either.

## Who touches it

This is **cross-domain** content. Rather than duplicate the mechanics, the domains link here:

- the **[account](./account.md)** domain **creates** the escrow at checkout and **releases** it on the
  happy path;
- the **[admin](./admin.md)** domain **settles** it when a dispute is concluded.

For the high-level state machine (order + escrow states and how they advance), see
**[lifecycle.md](./lifecycle.md)**. This tree describes the **mechanics**; the lifecycle gives the
overall picture.

## Where the code lives

- `src/lib/ark/escrow.ts` — `deriveEscrowAddress`, `buildEscrowVtxoScript`.
- `src/lib/ark/operator.ts` — `getArkOperatorConfig` (operator config, memoized).
- `src/lib/ark/funding.ts` — `getEscrowFunding`, `getEscrowVtxoSet` (indexer).
- `src/lib/ark/release.ts` — build/sign/submit/finalize of the collaborative release (client-side).
- `src/lib/ark/tx-validation.ts` — shared PSBT validation gates (the 422 gate).
- `src/lib/fees.ts` — `computeDisputeBreakdown`, `calculatePlatformFee`.
- Backend: `mutations-checkout.ts`, `mutations-orders.ts`, `query-orders.ts`.

## Read these in order

| File                                       | What it covers                                                                                                                                       |
| ------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| [escrow/contract.md](./escrow/contract.md) | **What the escrow is**: the taproot tree, its 6 spend paths, the per-order unique address, and how the address is derived and verified.              |
| [escrow/release.md](./escrow/release.md)   | **The happy path**: verifying the buyer paid, the seller confirming, and the 3-step collaborative release; polling and batch-expiry sweep.           |
| [escrow/dispute.md](./escrow/dispute.md)   | **When it goes wrong**: dispute settlement on Ark (arbiter leaf 1/2, prepare → finalize), the validation gates, and the on-chain CSV exit (Stage 2). |
| [escrow/fees.md](./escrow/fees.md)         | **The money split**: the platform fee, the admin dispute share, and overfunding.                                                                     |
