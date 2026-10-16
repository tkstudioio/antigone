"use client";

import { useWalletBalance, useWalletTransactions } from "@/hooks/wallet";
import { useWalletStore } from "@/stores/wallet";
import useProfileStore from "@/stores/profile";
import { SendDialog } from "@/components/send-dialog";
import { ReceiveDialog } from "@/components/receive-dialog";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Satoshi } from "@/components/icons/satoshi";
import { ArrowDownLeft, ArrowUpRight, CloudOff, ExternalLink, History } from "lucide-react";
import type { ArkTransaction } from "@arkade-os/sdk";
import { match } from "ts-pattern";
import Link from "next/link";
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

// ─── Section heading ─────────────────────────────────────────────────────────

function SectionTitle({ id, children }: { id?: string; children: React.ReactNode }) {
  return (
    <h2 id={id} className="text-xl font-semibold">
      {children}
    </h2>
  );
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
    <li className="flex items-center gap-4 p-4">
      <span
        aria-hidden
        className={cn(
          "flex size-10 shrink-0 items-center justify-center rounded-md [&_svg]:size-5",
          isReceived ? "bg-positive/15 text-positive" : "bg-muted text-muted-foreground"
        )}
      >
        {isReceived ? <ArrowDownLeft /> : <ArrowUpRight />}
      </span>

      <div className="min-w-0 flex-1 space-y-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-medium">{isReceived ? "Received" : "Sent"}</span>
          {txid && (
            <Badge action="muted" variant="outline" className="font-mono text-xs">
              {txid.type}
            </Badge>
          )}
        </div>
        {txid && (
          <Link
            target="_blank"
            rel="noopener noreferrer"
            href={explorerHref}
            className="flex min-w-0 items-center gap-1 font-mono text-xs text-muted-foreground hover:text-foreground hover:underline"
          >
            <span className="truncate">{txid.txId}</span>
            <ExternalLink className="size-3 shrink-0" aria-hidden />
            <span className="sr-only">(opens the explorer in a new tab)</span>
          </Link>
        )}
      </div>

      <div className="shrink-0 space-y-1 text-right">
        <p
          className={cn(
            "font-semibold tabular-nums",
            isReceived ? "text-positive" : "text-foreground"
          )}
        >
          {isReceived ? "+" : "−"}
          {formatSats(tx.amount)}
        </p>
        <p className="text-xs text-muted-foreground tabular-nums">
          {format(new Date(tx.createdAt), "yyyy-MM-dd HH:mm")}
        </p>
      </div>
    </li>
  );
}

// ─── Skeleton rows ────────────────────────────────────────────────────────────

function TxRowSkeleton() {
  return (
    <div className="flex items-center gap-4 p-4">
      <Skeleton className="size-10 shrink-0" />
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

  const { data, isLoading, error } = balanceQuery;
  const neitherHasData = !balanceQuery.data && !txQuery.data;

  // Identity present but wallet not initialized: the ASP (mutinynet.arkade.sh) is
  // unreachable. The auto-retry (useWalletAutoInit) will repopulate the wallet as soon as
  // the ASP comes back; meanwhile we show a clear state instead of zero balances.
  if (account && !wallet) {
    return (
      <section className="space-y-4">
        <SectionTitle>Wallet</SectionTitle>
        <Alert action="negative">
          <CloudOff />
          <AlertTitle>Wallet service unavailable</AlertTitle>
          <AlertDescription>
            Unable to reach the Arkade server. Balance, sending and receiving are not available at
            the moment. Try again later: the connection will be restored automatically.
          </AlertDescription>
        </Alert>
      </section>
    );
  }

  if (!initialized && neitherHasData) {
    return (
      <section className="space-y-4" aria-busy aria-label="Loading wallet">
        <SectionTitle>Wallet</SectionTitle>
        <Skeleton className="h-56 w-full" />
        <Skeleton className="h-48 w-full" />
      </section>
    );
  }

  return (
    <>
      <section aria-labelledby="wallet-balance-heading" className="space-y-4">
        <SectionTitle id="wallet-balance-heading">Wallet</SectionTitle>

        <Card className="relative isolate space-y-0 p-6">
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 -z-10 bg-linear-to-br from-primary/30 via-transparent to-transparent"
          />
          <div className="flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
            <div className="space-y-2">
              <p className="font-mono text-xs tracking-widest text-muted-foreground uppercase">
                Available balance
              </p>
              {isLoading ? (
                <Skeleton className="h-12 w-56" />
              ) : (
                <p className="flex items-center gap-1 text-4xl font-bold tabular-nums sm:text-5xl">
                  <Satoshi className="size-9 shrink-0 sm:size-11" aria-hidden />
                  {(data?.available ?? 0).toLocaleString("en-US")}
                  <span className="sr-only">sats</span>
                </p>
              )}
            </div>
            <div className="flex w-full gap-2 sm:w-auto">
              <ReceiveDialog />
              <SendDialog />
            </div>
          </div>

          {error ? (
            <p className="mt-6 border-t pt-6 text-sm text-destructive">
              Unable to load the balance.
            </p>
          ) : (
            <dl className="mt-6 grid grid-cols-2 gap-4 border-t pt-6 text-sm">
              <div className="space-y-1">
                <dt className="text-muted-foreground">Onboarding</dt>
                <dd className="font-medium tabular-nums">
                  {isLoading ? (
                    <Skeleton className="h-5 w-24" />
                  ) : (
                    formatSats(data?.boarding?.total ?? 0)
                  )}
                </dd>
              </div>
              <div className="space-y-1">
                <dt className="text-muted-foreground">Total</dt>
                <dd className="font-semibold tabular-nums">
                  {isLoading ? <Skeleton className="h-5 w-32" /> : formatSats(data?.total ?? 0)}
                </dd>
              </div>
            </dl>
          )}
        </Card>
      </section>

      <section aria-labelledby="wallet-tx-heading" className="space-y-4">
        <SectionTitle id="wallet-tx-heading">Latest transactions</SectionTitle>
        {match(txQuery)
          .with({ isLoading: true }, () => (
            <Card className="space-y-0 divide-y py-0">
              {Array.from({ length: 3 }, (_, i) => (
                <TxRowSkeleton key={i} />
              ))}
            </Card>
          ))
          .with({ isError: true }, () => (
            <p className="text-sm text-destructive">Unable to load transactions.</p>
          ))
          .with({ data: [] }, () => (
            <div className="flex flex-col items-center gap-3 rounded-md border border-dashed p-8 text-center">
              <span
                aria-hidden
                className="flex size-10 items-center justify-center rounded-md bg-muted text-muted-foreground [&_svg]:size-5"
              >
                <History />
              </span>
              <div className="space-y-1">
                <p className="font-semibold">No transactions yet</p>
                <p className="text-sm text-muted-foreground">
                  Use Receive to fund your wallet. Payments into order escrows will show up here.
                </p>
              </div>
            </div>
          ))
          .otherwise(({ data }) => (
            <Card className="space-y-0 py-0">
              <ul className="divide-y">
                {(data ?? []).map((tx) => (
                  <TxRow key={txRowKey(tx)?.txId} tx={tx} />
                ))}
              </ul>
            </Card>
          ))}
      </section>
    </>
  );
}
