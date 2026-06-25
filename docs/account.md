# Domain `(account)` — Authenticated user area

Area reserved for logged-in users. All APIs require `requireSessionRoute()` and every mutation
is **signed** (`verifySignedJsonBody`, see [crypto/signing.md](./crypto/signing.md)). It gathers
five sub-flows: **cart**, **orders**, **stock**, **wallet**, **chat**.

## Pages

- `cart` — cart.
- `orders/buying` · `orders/selling` · `orders/[id]` — orders as buyer/seller and detail.
- `stocks` · `stocks/[productSlug]` — seller stock management.
- `dashboard/wallet` — Arkade wallet (client-side).

## Entities involved

`Key`, `Order`, `Chat`, `Message`, `MessageKey`, `Escrow` (see [data.md](./data.md)).

## Sub-flows (L3)

| Sub-flow | Document                                 | Summary                                                                                                 |
| -------- | ---------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| Cart     | [account/cart.md](./account/cart.md)     | Ephemeral reservation (10 min) of `Key`s: `reserveKeys`, release/clear.                                 |
| Orders   | [account/orders.md](./account/orders.md) | Checkout (one order per seller + escrow), payment, list/detail. Ark mechanics → [escrow/](./escrow.md). |
| Stock    | [account/stocks.md](./account/stocks.md) | Price tier, upload/delete keys (encrypted codes → [crypto/at-rest.md](./crypto/at-rest.md)).            |
| Chat     | [account/chat.md](./account/chat.md)     | Order chat buyer↔seller, attachments (E2E → [crypto/messaging.md](./crypto/messaging.md)).              |

For the order/escrow state picture see [lifecycle.md](./lifecycle.md).

## Wallet

The `dashboard/wallet` page renders the shared component `src/components/wallet-overview.tsx`
(balance, send/receive, transaction history). Entirely **client-side** through the Arkade SDK; it does not use
the application APIs. State lives in the Zustand stores `src/stores/wallet.ts` and `src/stores/profile.ts`
(SDK provider construction, privkey derivation from the mnemonic). Runtime configured by
`NEXT_PUBLIC_ARK_OPERATOR_URL` and `NEXT_PUBLIC_BOLTZ_SWAP_PROVIDER`. The same component is reused by the
`(admin)/wallet` page (see [admin.md](./admin.md)).

**Session ↔ ASP decoupling (resilience).** Wallet initialization (`setAccount` in
`src/stores/profile.ts`) is split into two phases: the **identity** (`account` + providers, pure constructors)
is set always and immediately, while the **network part** (`Wallet.create`, which fetches
`/v1/info` from the ASP, + address derivation) is delegated to `initWallet()`, **best-effort and without
throwing**. If the ASP (`NEXT_PUBLIC_ARK_OPERATOR_URL`, default `mutinynet.arkade.sh`) is unreachable,
login and all non-wallet features (chat, orders, stock, cart/checkout signing) remain
usable: they depend only on `account`. The wallet stays unavailable (`wallet`/`addresses`
undefined) and `useWalletAutoInit` (`src/hooks/wallet.ts`, mounted in `WalletAutoReconnect`) retries
`initWallet()` with backoff (5s→30s) and on window focus/online, repopulating it as soon as the ASP comes back —
without re-entering the passphrase. `WalletOverview`/`ReceiveDialog` show a «Wallet service
unavailable» state in this condition. On the server side, `getArkOperatorConfig()` at checkout
(`api/cart/checkout/route.ts`) is wrapped in try/catch → **503** with an explicit message if the ASP is down
(order creation does require the ASP anyway). No automatic `signOut()` is tied to ASP errors.

**Sending (`useSendPayment` in `src/hooks/wallet.ts`).** The destination is interpreted by
`parseBIP21Address`: an Ark address (`ark1`/`tark1`) or a BIP21 toward our operator → instant off-chain
send (`wallet.sendBitcoin`); an on-chain address (`tb1`/`bc1`/`bcrt1`) — also as a fallback of a
BIP21 without our operator's Ark address — → **offboard** via `Ramps.offboard(address, info.fees, amount)`
(collaborative VTXO exit settled on-chain). Lightning is not yet supported via web. In
`wallet-overview.tsx` the links of `boarding`-type transactions point to `mutinynet.com`, the others
to the Arkade explorer.
