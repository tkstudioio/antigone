"use client";

import { cn, formatPrice } from "@/lib/utils";

type Props = {
  /** Sats currently locked at the escrow address (live from the indexer). */
  total: number;
  /** Sats required to fully fund the escrow. */
  price: number;
  /** Soonest batch-expiry (epoch ms) of the locked VTXOs, or null/undefined if unknown. */
  expiresAt?: number | null;
  /** True when batch expiry is near (computed server-side; the bar only renders the warning). */
  expirySoon?: boolean;
  /** True when the locked funds appear to have been swept by the operator after batch expiry. */
  swept?: boolean;
  className?: string;
};

function formatExpiry(expiresAt: number): string {
  return new Date(expiresAt).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" });
}

/**
 * Progress bar showing how much of the required escrow amount is currently locked on-chain,
 * e.g. "4.000 sats locked of 6.000 sats — 2.000 sats missing". Prices are in satoshi; uses
 * `formatPrice` (never €). When the escrow's VTXOs near their batch expiry it warns; if the funds
 * appear swept after expiry it shows an error (the order must be resolved before expiry — there is
 * no escrow renewal, see Arkade "Batch Expiry").
 */
export function EscrowFundingBar({ total, price, expiresAt, expirySoon, swept, className }: Props) {
  const safePrice = Math.max(0, price);
  const ratio = safePrice > 0 ? Math.min(1, total / safePrice) : total > 0 ? 1 : 0;
  const missing = Math.max(0, safePrice - total);
  const isFunded = total >= safePrice && safePrice > 0;

  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <div className="flex items-center justify-between text-sm">
        <span className="text-muted-foreground">
          {formatPrice(total)} locked of {formatPrice(safePrice)}
        </span>
        <span className={cn("font-medium", isFunded ? "text-primary" : "text-foreground")}>
          {Math.round(ratio * 100)}%
        </span>
      </div>
      <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
        <div
          className={cn(
            "h-full rounded-full transition-all",
            isFunded ? "bg-primary" : "bg-amber-500"
          )}
          style={{ width: `${ratio * 100}%` }}
        />
      </div>
      {swept ? (
        <span className="text-xs text-destructive">
          The escrow funds have expired and have been swept by the operator.
        </span>
      ) : expirySoon && expiresAt != null ? (
        <span className="text-xs text-amber-600">
          Warning: the funds expire on {formatExpiry(expiresAt)}. Conclude the order before this
          date.
        </span>
      ) : missing > 0 ? (
        <span className="text-xs text-muted-foreground">{formatPrice(missing)} missing</span>
      ) : (
        isFunded && <span className="text-xs text-primary">Escrow fully funded</span>
      )}
    </div>
  );
}
