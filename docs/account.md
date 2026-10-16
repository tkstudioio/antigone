# Domain `(account)` — Authenticated user area

Area reserved for logged-in users. All APIs require `requireSessionRoute()` and every mutation
is **signed** (`signedRoute`, see [crypto/signing.md](./crypto/signing.md)). It gathers
five sub-flows: **cart**, **orders**, **stock**, **wallet**, **chat**.

## Layout shell

`src/app/(account)/layout.tsx` gates the area (no session → `/login`, admin → `/disputes`) and wraps
it in `SidebarProvider` + `AppSidebar` + `SidebarInset`. A skip link toward `#main` comes first — on
desktop the sidebar's links precede the content in tab order. The mobile-only sticky header carries
the icon logo and the `SidebarTrigger`; `<main id="main">` is the shared container
(`mx-auto w-full max-w-6xl space-y-8 px-4 py-8 md:px-8 md:py-10`). It is capped on the inset's own
width rather than with `container` (whose breakpoints follow the viewport and ignore the sidebar), and
every page root that sets a narrower `max-w-*` also carries `mx-auto`, so content is always centred.

**Sidebar** (`src/components/app-sidebar.tsx`, client — it needs `usePathname` and the cart count).
Navigation is grouped by **what the user is doing**, not by the route group that serves it:

| Group     | Items                                                      |
| --------- | ---------------------------------------------------------- |
| `Browse`  | Products, Cart (with the live count as `SidebarMenuBadge`) |
| `Buying`  | Purchases                                                  |
| `Selling` | Stocks, Sales                                              |
| `Account` | Wallet (`/dashboard`)                                      |

The footer is a single condensed identity tile (40px identicon + `session.user.username` + truncated
pubkey). It opens a dropdown menu (`src/components/ui/dropdown-menu.tsx`) holding the **theme**
choice (Light / Dark / System, via `next-themes`' `ThemeProvider` in `src/providers/index.tsx`,
`class` attribute, default dark) and **Log out**, which opens an `AlertDialog` — signing out clears
the derived key and the wallet stores, so logging back in needs the passphrase again.

All groups render through one `NavMenuItem`, which resolves the active state
(`matchPrefix` for the sections with sub-routes) and sets `aria-current="page"` on it. The cart
badge shows the number `aria-hidden` next to an `sr-only` `role="status"` «N items in cart», so a
change is announced as a meaningful status rather than a bare number.

**Responsive behaviour.** `collapsible` is `offcanvas` on mobile and `none` on desktop. `side="right"`
therefore only takes effect on mobile, where the sidebar is a sheet opening next to its trigger in
the header; on desktop `collapsible="none"` renders a column in normal flow, so DOM order
places it to the left of the inset. On desktop it is styled as a **floating** panel (sticky, inset
`0.75rem` from the viewport edges, `rounded-xl`, `ring-sidebar-border`, `shadow-sm`) — applied via
`className`, since `variant="floating"` has no effect with `collapsible="none"`. There is **no icon-collapsed state** — the tooltips and the
`group-data-[collapsible=icon]` branches that used to be carried around were dead code and are gone.

The admin area has its own shell (`src/components/admin-sidebar.tsx`), see [admin.md](./admin.md).

## Pages

- `cart` — cart.
- `orders/buying` · `orders/selling` · `orders/[id]` — orders as buyer/seller and detail.
- `stocks` · `stocks/[productSlug]` — seller stock management.
- `dashboard` — Arkade wallet (client-side), preceded by an identity card (`src/components/account-pubkey-card.tsx`: identicon + `session.user.username`, and `session.user.pubkey` from `useSession()`, read-only, with copy).

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

**Receiving (`receive-dialog.tsx`).** One QR code at a time, switched with a `SegmentedControl`
(`src/components/ui/segmented-control.tsx`): Ark address (default), boarding address (on-chain) and
the universal BIP21 URI (`bitcoin:<boarding>?ark=<ark>`); only the available ones are offered. Each
comes with a copy action. QRs are rendered client-side with `qrcode.react`, always dark-on-white.

**Destination input (`send-dialog.tsx`).** The user either types/pastes the destination (with a
«Paste» button reading the clipboard) or scans a QR with `CameraQrScanner`
(`src/components/camera-qr-scanner.tsx`, `qr-scanner` library: native `BarcodeDetector` when
available, a Web Worker decoder otherwise). The camera is opened only while the scan view is mounted
and released on decode, mode switch or dialog close. Before starting `qr-scanner` the component
calls `getUserMedia` itself, because the library masks every failure as "Camera not found"; this
lets it show a distinct placeholder for each case: insecure context / no API, no camera, permission
prompt pending, permission denied, camera busy/other error (all with a way back to manual entry).
The decoded text is normalized (all-uppercase payloads lowercased, `BITCOIN:` scheme lowercased)
and lands in the input, where it goes through the same `parseBIP21Address` badge/validation as typed
text. Camera access requires HTTPS (or localhost).

**Sending (`useSendPayment` in `src/hooks/wallet.ts`).** The destination is interpreted by
`parseBIP21Address`: an Ark address (`ark1`/`tark1`) or a BIP21 toward our operator → instant off-chain
send (`wallet.sendBitcoin`); an on-chain address (`tb1`/`bc1`/`bcrt1`) — also as a fallback of a
BIP21 without our operator's Ark address — → **offboard** via `Ramps.offboard(address, info.fees, amount)`
(collaborative VTXO exit settled on-chain). Lightning is not yet supported via web. In
`wallet-overview.tsx` the links of `boarding`-type transactions point to `mutinynet.com`, the others
to the Arkade explorer.
