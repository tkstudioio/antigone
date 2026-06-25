"use client";

import { useWalletBalance, useWalletTransactions } from "@/hooks/wallet";
import { useWalletStore } from "@/stores/wallet";
import useProfileStore from "@/stores/profile";
import { SendDialog } from "@/components/send-dialog";
import { ReceiveDialog } from "@/components/receive-dialog";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Minus, Plus } from "lucide-react";
import type { ArkTransaction } from "@arkade-os/sdk";
import { match } from "ts-pattern";
import Link from "next/link";
import { H1, Large } from "@/components/ui/typography";
import { cn } from "@/lib/utils";
import { format } from "date-fns";

// ─── helpers ────────────────────────────────────────────────────────────────

function formatSats(n: number): string {
  return n.toLocaleString("en-US") + " sats";
}

function txRowKey(
  tx: ArkTransaction
): { txId: string; type: "ark" | "commitment" | "boarding" } | undefined {
  if (tx.key.arkTxid) return { txId: tx.key.arkTxid, type: "ark" };
  if (tx.key.commitmentTxid) return { txId: tx.key.commitmentTxid, type: "commitment" };
  if (tx.key.boardingTxid) return { txId: tx.key.boardingTxid, type: "boarding" };
}

// ─── Transaction row ─────────────────────────────────────────────────────────

function TxRow({ tx }: { tx: ArkTransaction }) {
  const isReceived = (tx.type as string) === "RECEIVED";
  const txid = txRowKey(tx);

  // Boarding txs settle on the underlying chain, so they're explorable on Mutinynet;
  // ark/commitment txs live on the Arkade explorer.
  const explorerHref =
    txid?.type === "boarding"
      ? `https://mutinynet.com/tx/${txid.txId}`
      : `https://explorer.mutinynet.arkade.sh/tx/${txid?.txId}`;

  return (
    <Card>
      <CardHeader>
        <CardTitle
          className={cn("flex items-center gap-sm", {
            "text-negative": !isReceived,
            "text-positive": isReceived,
          })}
        >
          {isReceived ? (
            <Plus className="text-positive inline" />
          ) : (
            <Minus className="text-negative inline" />
          )}
          {formatSats(tx.amount)}

          <span className="text-sm text-muted">
            {format(new Date(tx.createdAt), "yyyy-MM-dd hh:mm")}
          </span>
        </CardTitle>
        <Link target="_blank" href={explorerHref} className="truncate font-mono hover:underline">
          <CardDescription>
            {txid?.type} - {txid?.txId}
          </CardDescription>
        </Link>
      </CardHeader>
    </Card>
  );
}

// ─── Skeleton rows ────────────────────────────────────────────────────────────

function TxRowSkeleton() {
  return (
    <div className="flex items-center gap-md py-sm">
      <Skeleton className="size-5 shrink-0 rounded-full" />
      <div className="flex-1 min-w-0 space-y-1.5">
        <Skeleton className="h-4 w-28" />
        <Skeleton className="h-3 w-48 max-w-full" />
      </div>
      <div className="flex shrink-0 flex-col items-end gap-1.5">
        <Skeleton className="h-5 w-20" />
        <Skeleton className="h-3 w-24" />
      </div>
    </div>
  );
}

// ─── Wallet overview ───────────────────────────────────────────────────────────

/**
 * Full wallet view (balance, send/receive, transactions). It is account-agnostic:
 * it reads from the global hooks/stores, which derive the wallet from the logged-in account.
 * Shared between the user `(dashboard)` area and the `(admin)` area, where the admin operates
 * on the arbiter's wallet (same identity) and collects the arbitration earnings.
 */
export function WalletOverview() {
  const initialized = useWalletStore((s) => s.initialized);
  const account = useProfileStore((s) => s.account);
  const wallet = useProfileStore((s) => s.wallet);
  const balanceQuery = useWalletBalance();
  const txQuery = useWalletTransactions();
  const walletTransactionsQuery = useWalletTransactions();

  const { data, isLoading, error } = useWalletBalance();
  const neitherHasData = !balanceQuery.data && !txQuery.data;

  // Identity present but wallet not initialized: the ASP (mutinynet.arkade.sh) is
  // unreachable. The auto-retry (useWalletAutoInit) will repopulate the wallet as soon as
  // the ASP comes back; meanwhile we show a clear state instead of zero balances.
  if (account && !wallet) {
    return (
      <section className="space-y-6 max-w-3xl">
        <H1>Wallet</H1>
        <Card>
          <CardHeader>
            <CardTitle>Wallet service unavailable</CardTitle>
            <CardDescription>
              Unable to reach the Arkade server. Balance, sending and receiving are not available at
              the moment. Try again later: the connection will be restored automatically.
            </CardDescription>
          </CardHeader>
        </Card>
      </section>
    );
  }

  if (!initialized && neitherHasData) {
    return (
      <section className="space-y-6 max-w-3xl ">
        <H1>Wallet</H1>
        <Skeleton className="aspect-video w-full"></Skeleton>
      </section>
    );
  }

  return (
    <>
      <Large>Your balance</Large>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-4">
          <p className="text-sm text-muted-foreground">Available balance</p>
          {isLoading ? (
            <Skeleton className="h-9 w-44" />
          ) : (
            <CardTitle className="text-3xl tabular-nums">
              {formatSats(data?.available ?? 0)}
            </CardTitle>
          )}
        </CardHeader>

        <CardContent>
          {error ? (
            <p className="text-sm text-destructive">Unable to load the balance.</p>
          ) : (
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Onboarding</span>
              {isLoading ? (
                <Skeleton className="h-5 w-24" />
              ) : (
                <span className="font-medium tabular-nums">
                  {formatSats(data?.boarding?.total ?? 0)}
                </span>
              )}
            </div>
          )}
        </CardContent>

        <CardFooter className="justify-between border-t pt-md">
          <span className="text-sm text-muted-foreground">Total</span>
          {isLoading ? (
            <Skeleton className="h-6 w-32" />
          ) : (
            <span className="font-semibold tabular-nums">{formatSats(data?.total ?? 0)}</span>
          )}
        </CardFooter>
      </Card>
      <div className="flex items-center gap-sm w-full">
        <SendDialog />
        <ReceiveDialog />
      </div>
      <Large>Latest transactions</Large>
      <div className="space-y-md">
        {match(walletTransactionsQuery)
          .with({ isLoading: true }, () => (
            <div className="divide-y divide-border">
              {Array.from({ length: 3 }, (_, i) => (
                <TxRowSkeleton key={i} />
              ))}
            </div>
          ))
          .with({ isError: true }, () => (
            <p className="text-sm text-destructive">Unable to load transactions.</p>
          ))
          .with({ data: [] }, () => (
            <p className="text-sm text-muted-foreground">No transactions.</p>
          ))
          .otherwise(({ data }) =>
            (data ?? []).map((tx) => <TxRow key={txRowKey(tx)?.txId} tx={tx} />)
          )}
      </div>
    </>
  );
}
