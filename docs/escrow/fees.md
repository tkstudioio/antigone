# Fees

Every trade carries a small **platform fee**, and a disputed trade can carry an extra **admin dispute
share**. Both are paid out of the escrow when it settles. This page explains who pays them, when they
are charged, and how the escrow's funds are split at the end. All amounts are in satoshi; the code
lives in `src/lib/fees.ts` (`calculatePlatformFee`, `computeDisputeBreakdown`).

## Who pays, and when

- **The platform fee is a surcharge on the buyer**, charged **at checkout**. The buyer locks the item
  price _plus_ the fee into the escrow; the seller still cashes out the full item price, and the
  platform keeps the fee. This is why the escrow is funded for more than the item price:
  `Escrow.price = totalSats + platformFee`.
- **The fee is fixed at checkout** and saved on `Order.platformFee` / `Escrow.platformFee`. Changing
  the percentage later does not affect orders already created.

## The platform fee (1% by default)

`PLATFORM_FEE_PERCENT` defaults to `1` (override via env; `"0"` disables fees entirely). At checkout,
`calculatePlatformFee` computes:

    platformFee = dust + ceil(totalSats * PLATFORM_FEE_PERCENT / 100)

`dust` is the operator's dust threshold (`getInfo().dust`). It is added because the fee becomes its
own output in the settlement transaction, and that output must clear the dust threshold to be valid.
So even the smallest possible order pays at least `dust + 1`. If `PLATFORM_FEE_PERCENT` is `0`, the
fee is `0`, there is no extra output, and the flow is identical to an escrow with no fee.

## The split at settlement

**Happy path** (`release.ts`) — the release transaction has **two outputs**:

- seller receives `lockedTotal - platformFee`,
- admin receives `platformFee`.

The buyer signs the release and validates this split client-side; the server re-validates it in
`prepareRelease`.

**Dispute** (`computeDisputeBreakdown`) — the admin can additionally take an **admin dispute share**
for arbitrating: `adminDisputeShare = ceil(totalSats * ADMIN_DISPUTE_SHARE_PERCENT / 100)` (env,
default `0`). The split becomes:

- admin receives `platformFee + adminDisputeShare`,
- buyer receives `refundAmount` (the amount the admin ruled refundable), plus any overfunding surplus
  (see below),
- seller receives `totalSats - adminDisputeShare - refundAmount`.

The platform fee is **non-refundable** — it is the cost of the escrow service — and it is **not** taken
from the seller, who never paid it. The system rejects any refund that would drive the seller's share
below zero (`refundAmount > totalSats - adminDisputeShare`).

## Overfunding

If the buyer locks **more** than `Escrow.price`, dispute settlement splits over the **actually locked
total** (`lockedTotal` = sum of the spent VTXOs) and returns the surplus
(`lockedTotal - (totalSats + platformFee)`) to the buyer, keeping the transaction balanced
(`sum(outputs) == sum(inputs)`; Arkade's offchain fee is 0). The happy-path release already pays the
entire locked total to the seller, so there is nothing to return there.

> A **partial refund** (`partially_refunded`) needs no dedicated path: the arbiter leaves can build a
> transaction with multiple outputs, and a party that only receives funds does not sign (see
> [contract.md](./contract.md)).

## Fee enforcement (happy path)

The collaborative release leaf is `buyer + seller + operator` — the admin does **not** sign it. The
split is built by the official client and re-validated server-side in `prepareRelease`, so the
official flow always collects the fee. A custom client that bypassed the server and signed directly
with the operator could omit it; fully enforcing the fee cryptographically would require the admin as
a co-signer of leaf 0, which is out of scope.
