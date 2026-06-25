"use client";

import { useEffect, useRef } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSession } from "next-auth/react";
import { useWalletStore } from "@/stores/wallet";
import { parseBIP21Address, type ArkTransaction } from "@/lib/ark";
import useProfileStore from "@/stores/profile";
import type { StoredAccount } from "@/types/account";
import { useAccountsList } from "@/hooks/accounts";
import { clearUnlockedAccount, readUnlockedAccount } from "@/lib/auth/session-vault";
import { ArkInfo, Ramps } from "@arkade-os/sdk";

export function useWalletBalance() {
  const { wallet, account } = useProfileStore();

  return useQuery({
    queryKey: ["wallet", account?.pubkey, "balance"],
    queryFn: async () => {
      if (!wallet) return { available: 0, boarding: { total: 0 }, total: 0 };
      return wallet.getBalance();
    },
    refetchInterval: 30_000,
    enabled: !!wallet,
  });
}

export function useWalletTransactions() {
  const { wallet, account } = useProfileStore();

  return useQuery<ArkTransaction[]>({
    queryKey: ["wallet", account?.pubkey, "transactions"],
    queryFn: async () => {
      if (!wallet) return [];
      return wallet.getTransactionHistory();
    },
    refetchInterval: 10_000,
    enabled: !!wallet,
  });
}

export function useWalletAspInfo() {
  const { wallet, account } = useProfileStore();

  return useQuery<ArkInfo | null>({
    queryKey: ["wallet", account?.pubkey, "asp-info"],
    queryFn: async () => {
      if (!wallet) return null;
      return (await wallet.arkProvider.getInfo()) as ArkInfo;
    },
    refetchInterval: 60_000,
    staleTime: 60_000,
    enabled: !!wallet,
  });
}

export function useSendPayment() {
  const { wallet } = useProfileStore();

  const aspSignerPubkey = useWalletStore((s) => s.aspSignerPubkey);
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ destination, amount }: { destination: string; amount: number }) => {
      if (!wallet) throw new Error("Wallet not initialized");
      const w = wallet;

      const parsed = parseBIP21Address(destination);
      if (!parsed) throw new Error("Address not recognized");

      // Leaving Arkade for a plain on-chain address means collaboratively exiting the VTXOs
      // (offboard) to that address — a batch swap settled on-chain, not an off-chain Ark send.
      const offboard = async (address: string, sats: number) => {
        const info = (await w.arkProvider.getInfo()) as ArkInfo;
        await new Ramps(w).offboard(address, info.fees, BigInt(sats));
      };

      if (parsed.type === "ark") {
        await w.sendBitcoin({ address: parsed.arkAddress!, amount: parsed.amount ?? amount });
        return;
      }

      if (parsed.type === "bip21") {
        // Prefer the off-chain Ark address only when the URI targets our own operator;
        // otherwise the payment leaves Arkade → offboard to the on-chain address.
        const arkUsable =
          parsed.signerPubkey && parsed.signerPubkey === aspSignerPubkey && parsed.arkAddress;
        if (arkUsable) {
          await w.sendBitcoin({ address: parsed.arkAddress!, amount: parsed.amount ?? amount });
        } else {
          await offboard(parsed.onchainAddress!, parsed.amount ?? amount);
        }
        return;
      }

      if (parsed.type === "onchain") {
        await offboard(parsed.onchainAddress!, amount);
        return;
      }

      throw new Error("Lightning not yet supported via web");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["wallet", "balance"],
      });
      queryClient.invalidateQueries({
        queryKey: ["wallet", "transactions"],
      });
    },
  });
}

/**
 * Auto-retry of the wallet initialization when the `account` is in memory but the
 * `wallet` is unavailable (e.g. the ASP was unreachable during `setAccount`).
 *
 * Decouples the identity (always set, no network) from the wallet (ASP network, best-effort):
 * the session and the non-wallet features stay usable, and the wallet populates itself
 * as soon as the ASP comes back — without re-entering the passphrase.
 *
 * Strategy: polling with backoff (5s → 30s) until the wallet exists, plus an immediate
 * retry when the tab regains focus or the network comes back online.
 */
export function useWalletAutoInit() {
  const account = useProfileStore((s) => s.account);
  const wallet = useProfileStore((s) => s.wallet);
  const initWallet = useProfileStore((s) => s.initWallet);

  const needsInit = !!account && !wallet;

  useEffect(() => {
    if (!needsInit) return;

    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let delay = 5_000;
    const MAX_DELAY = 30_000;
    let running = false;

    const attempt = async () => {
      if (cancelled || running) return;
      // The store may have already populated (e.g. from another retry): avoid useless work.
      if (useProfileStore.getState().wallet) return;
      running = true;
      const ok = await initWallet().catch(() => false);
      running = false;
      if (cancelled || ok) return;
      delay = Math.min(delay * 2, MAX_DELAY);
      timer = setTimeout(attempt, delay);
    };

    const onWakeup = () => {
      delay = 5_000;
      if (timer) clearTimeout(timer);
      void attempt();
    };

    // First attempt immediately, then polling with backoff.
    timer = setTimeout(attempt, delay);
    void attempt();
    window.addEventListener("focus", onWakeup);
    window.addEventListener("online", onWakeup);

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
      window.removeEventListener("focus", onWakeup);
      window.removeEventListener("online", onWakeup);
    };
  }, [needsInit, initWallet]);
}

/**
 * Subscribe to the Arkade SDK incoming-funds stream and invalidate the wallet
 * queries (`balance`, `transactions`, …) as soon as new funds are detected,
 * so the UI updates in realtime instead of waiting for the polling interval.
 *
 * The `refetchInterval` in the wallet queries above stays as a fallback for the
 * case where the subscription cannot be opened.
 */
export function useWalletNotifications() {
  const wallet = useProfileStore((s) => s.wallet);
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!wallet) return;

    let unsubscribe: (() => void) | undefined;
    let cancelled = false;

    wallet
      .notifyIncomingFunds(() => {
        void queryClient.invalidateQueries({ queryKey: ["wallet"] });
      })
      .then((stop) => {
        if (cancelled) {
          stop();
          return;
        }
        unsubscribe = stop;
      })
      .catch(() => {
        // Subscription unavailable: the wallet query polling remains as fallback.
      });

    return () => {
      cancelled = true;
      unsubscribe?.();
    };
  }, [wallet, queryClient]);
}

/**
 * Wallet "lock" state after a reload. The NextAuth session survives but the
 * privkey (in memory in the profile store) does not, so here we decide what to do:
 *
 * - `none`        → nothing to do (not authenticated, already unlocked in memory, or
 *                   no local account matches the session pubkey).
 * - `rehydrating` → there is an unlocked account in sessionStorage: we silently
 *                   reconstruct it via `setAccount`, without asking for the passphrase.
 * - `locked`      → manual unlock is needed: the UI shows the passphrase dialog.
 */
export type WalletLockState =
  | { kind: "none" }
  | { kind: "rehydrating" }
  | { kind: "locked"; account: StoredAccount };

export function useWalletAutoReconnect(): WalletLockState {
  const { data: session, status } = useSession();
  const account = useProfileStore((s) => s.account);
  const setAccount = useProfileStore((s) => s.setAccount);
  const accounts = useAccountsList();

  // Avoid double rehydration (StrictMode / re-render) for the same pubkey.
  const rehydratingPubkey = useRef<string | null>(null);

  const sessionPubkey = status === "authenticated" ? session?.user?.pubkey : undefined;

  // Account unlocked in the tab cache, valid only if it matches the session.
  const cached = sessionPubkey ? readUnlockedAccount() : null;
  const canRehydrate = Boolean(cached && cached.pubkey === sessionPubkey && !account);

  useEffect(() => {
    if (status === "unauthenticated") {
      // Logout or expired session: clear the cache (also covers signOuts that
      // do not go through profileStore.clear(), e.g. the admin area).
      clearUnlockedAccount();
      rehydratingPubkey.current = null;
      return;
    }

    if (!canRehydrate || !cached) return;
    if (rehydratingPubkey.current === cached.pubkey) return;

    rehydratingPubkey.current = cached.pubkey;
    setAccount(cached).catch(() => {
      // Cache unusable (e.g. corrupted privkey): fall back to the unlock dialog.
      clearUnlockedAccount();
      rehydratingPubkey.current = null;
    });
  }, [status, canRehydrate, cached, setAccount]);

  if (status !== "authenticated") return { kind: "none" };
  if (account) return { kind: "none" };
  if (!sessionPubkey) return { kind: "none" };

  // Cache present but for another account: discard it and proceed to manual unlock.
  if (cached && cached.pubkey !== sessionPubkey) clearUnlockedAccount();

  if (canRehydrate) return { kind: "rehydrating" };

  const match = accounts.find((a) => a.pubkey === sessionPubkey);
  return match ? { kind: "locked", account: match } : { kind: "none" };
}
