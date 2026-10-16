"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, Timer, TimerOff, Trash2 } from "lucide-react";

import type { CartProduct } from "@/hooks/cart";
import { cn, formatPrice } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Satoshi } from "@/components/icons/satoshi";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

/**
 * Cart building blocks shared by the cart page (`CartDetail`) and the header's `CartSheet`, so the
 * two views of the same reservation never drift apart.
 */

/** Below this many seconds left, the countdown switches to its warning tier. */
const WARNING_THRESHOLD_SECONDS = 120;

function computeRemainingSeconds(targetIso: string): number {
  const diff = new Date(targetIso).getTime() - Date.now();
  return Math.max(0, Math.floor(diff / 1000));
}

function formatCountdown(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60)
    .toString()
    .padStart(2, "0");
  const seconds = (totalSeconds % 60).toString().padStart(2, "0");
  return `${minutes}:${seconds}`;
}

/** Ticks once per second; `remaining` is null until the first tick (and when there is no expiry). */
export function useCountdown(targetIso: string | null): {
  remaining: number | null;
  isExpired: boolean;
} {
  const [remaining, setRemaining] = useState<number | null>(null);

  useEffect(() => {
    if (!targetIso) return;
    const firstTick = setTimeout(() => setRemaining(computeRemainingSeconds(targetIso)), 0);
    const interval = setInterval(() => setRemaining(computeRemainingSeconds(targetIso)), 1000);
    return () => {
      clearTimeout(firstTick);
      clearInterval(interval);
    };
  }, [targetIso]);

  return { remaining, isExpired: remaining === 0 };
}

export function ReservationStatus({ remaining }: { remaining: number | null }) {
  const tier =
    remaining === null
      ? "pending"
      : remaining === 0
        ? "expired"
        : remaining < WARNING_THRESHOLD_SECONDS
          ? "warning"
          : "active";

  const Icon = tier === "expired" ? TimerOff : tier === "warning" ? AlertTriangle : Timer;
  const message =
    tier === "pending"
      ? "Checking reservation…"
      : tier === "expired"
        ? "Reservation expired — your items are no longer reserved."
        : tier === "warning"
          ? "Reservation ending soon — check out now to keep your items."
          : "Your items are reserved for you.";

  return (
    <div
      role="status"
      aria-atomic
      className={cn(
        "flex min-h-16 items-center gap-3 rounded-md border px-4 py-3",
        tier === "expired" && "border-negative bg-negative/15",
        tier === "warning" && "border-warning bg-warning/15",
        tier === "active" && "border-positive bg-positive/15",
        tier === "pending" && "border-border bg-muted"
      )}
    >
      <Icon
        aria-hidden
        className={cn(
          "size-5 shrink-0",
          tier === "expired" && "text-negative",
          tier === "warning" && "text-warning",
          tier === "active" && "text-positive",
          tier === "pending" && "text-muted-foreground"
        )}
      />
      <p className="min-w-0 flex-1 text-sm">{message}</p>
      <span className="font-mono text-lg font-semibold tabular-nums">
        <span className="sr-only">Time left: </span>
        {remaining === null ? "--:--" : formatCountdown(remaining)}
      </span>
    </div>
  );
}

export function CartProductRow({
  product,
  isRemoving,
  onRemove,
}: {
  product: CartProduct;
  isRemoving: boolean;
  onRemove: () => void;
}) {
  const singleTier = product.tiers.length === 1 ? product.tiers[0] : null;
  const keysLabel = `${product.totalQuantity.toLocaleString("en-US")} key${
    product.totalQuantity === 1 ? "" : "s"
  }`;

  return (
    <div className="space-y-3 p-4 sm:p-5">
      <div className="flex items-start gap-4">
        <div className="min-w-0 flex-1 space-y-1.5">
          <p className="truncate font-semibold">{product.productName}</p>
          <Badge variant="outline" action="muted" className="w-fit text-xs">
            {keysLabel}
          </Badge>
        </div>

        <p className="flex shrink-0 items-center font-semibold tabular-nums">
          <Satoshi className="size-4 shrink-0" aria-hidden />
          {formatPrice(product.totalSubtotal)}
          <span className="sr-only"> sats</span>
        </p>

        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button
              variant="ghost"
              action="negative"
              className="min-h-11 min-w-11"
              disabled={isRemoving}
              aria-label={`Remove ${product.productName} from cart`}
            >
              <Trash2 aria-hidden />
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Remove {product.productName}?</AlertDialogTitle>
              <AlertDialogDescription>
                This releases your reservation on all {keysLabel}. Other buyers will be able to take
                them.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel action="muted">Keep in cart</AlertDialogCancel>
              <AlertDialogAction action="negative" onClick={onRemove}>
                Remove
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>

      {singleTier ? (
        <TierLine tier={singleTier} />
      ) : (
        <Accordion type="single" collapsible className="w-full">
          <AccordionItem value="tiers" className="border-none">
            <AccordionTrigger className="py-1 text-xs text-muted-foreground hover:no-underline">
              Breakdown per stock
            </AccordionTrigger>
            <AccordionContent>
              <ul className="space-y-1 pt-1">
                {product.tiers.map((tier) => (
                  <li key={`${tier.sellerPubkey}-${tier.price}`}>
                    <TierLine tier={tier} />
                  </li>
                ))}
              </ul>
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      )}
    </div>
  );
}

function TierLine({ tier }: { tier: CartProduct["tiers"][number] }) {
  return (
    <div className="flex items-center justify-between gap-4 text-xs text-muted-foreground tabular-nums">
      <span className="flex min-w-0 items-center">
        <span className="shrink-0">{tier.quantity.toLocaleString("en-US")} ×</span>
        <Satoshi className="ml-1 size-3.5 shrink-0" aria-hidden />
        {formatPrice(tier.price)}
        <span className="sr-only"> sats</span>
        <span className="ml-1 truncate text-foreground/50">({tier.sellerUsername})</span>
      </span>
      <span className="flex shrink-0 items-center">
        <Satoshi className="size-3.5 shrink-0" aria-hidden />
        {formatPrice(tier.price * tier.quantity)}
        <span className="sr-only"> sats</span>
      </span>
    </div>
  );
}

export function SummaryLine({
  label,
  amount,
  strong,
}: {
  label: string;
  amount: number;
  strong?: boolean;
}) {
  return (
    <div className={cn("flex items-center justify-between gap-4", strong && "font-semibold")}>
      <dt className={cn(!strong && "text-muted-foreground")}>{label}</dt>
      <dd className="flex items-center tabular-nums">
        <Satoshi className="size-4 shrink-0" aria-hidden />
        {formatPrice(amount)}
        <span className="sr-only"> sats</span>
      </dd>
    </div>
  );
}
