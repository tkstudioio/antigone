"use client";

import Link from "next/link";
import { useEffect } from "react";
import { match } from "ts-pattern";
import { ArrowLeft } from "lucide-react";

import { useOrderDetail, useEscrowFunding, useVerifyFunding } from "@/hooks/orders";
import useProfileStore from "@/stores/profile";
import type { EscrowStatus } from "@/lib/escrow-status";
import { OrderStepper } from "@/components/order-stepper";
import { OrderSummaryCard } from "@/components/order-summary-card";
import { OrderProductsTable } from "@/components/order-products-table";
import { OrderActionsPanel } from "@/components/order-actions-panel";
import { OrderDisputePanel, shouldShowDisputePanel } from "@/components/order-dispute-panel";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { P } from "@/components/ui/typography";

type Props = {
  orderId: number;
};

/**
 * Client orchestrator for the order detail page. Owns the order + escrow-funding queries and the
 * auto-verify-funding effect, then composes the layout: a header with the lifecycle stepper, a
 * two-column body (summary + products on the left, the sticky actions sidebar on the right) and a
 * full-width dispute panel below when relevant. On mobile the sidebar stacks first so the available
 * action is reachable without scrolling.
 */
export function OrderDetail({ orderId }: Props) {
  const detailQuery = useOrderDetail(orderId);
  const escrowStatusLive = detailQuery.data?.escrow?.status;
  const funding = useEscrowFunding(orderId, {
    enabled: Boolean(detailQuery.data?.escrowAddress),
    escrowStatus: escrowStatusLive,
  });
  const verifyFunding = useVerifyFunding();
  const walletPrivateKey = useProfileStore((s) => s.account?.privateKey);

  // Auto-advance the escrow to `fundLocked` as soon as the live funding poll reports it is funded,
  // so the buyer doesn't have to press "Verify payment" manually.
  // Guard: only run when the wallet is unlocked (privateKey in memory) — if locked/rehydrating,
  // skip silently; the manual "Verify payment" button is the fallback.
  const fundingFunded = funding.data?.funded ?? false;
  useEffect(() => {
    if (
      fundingFunded &&
      (escrowStatusLive === "awaitingFunds" || escrowStatusLive === "partiallyFunded") &&
      !verifyFunding.isPending &&
      Boolean(walletPrivateKey)
    ) {
      verifyFunding.mutateAsync(orderId).catch(() => {});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fundingFunded, escrowStatusLive, orderId, walletPrivateKey]);

  return match(detailQuery)
    .with({ isPending: true }, () => (
      <div className="flex flex-col gap-6">
        <Skeleton className="h-8 w-32" />
        <div className="grid gap-6 lg:grid-cols-[minmax(280px,1fr)_4fr]">
          <Skeleton className="h-80 w-full" />
          <Skeleton className="h-96 w-full" />
        </div>
      </div>
    ))
    .with({ isError: true }, () => <P>Error loading the order.</P>)
    .with({ isSuccess: true }, ({ data: order }) => {
      if (!order) return <P>Order not found.</P>;

      const backHref = order.role === "buyer" ? "/orders/buying" : "/orders/selling";
      const escrowStatus = order.escrow?.status as EscrowStatus | undefined;

      return (
        <div className="flex flex-col gap-6">
          {/* Header: back link only */}
          <Button asChild variant="ghost" size="sm" className="-ml-2 w-fit">
            <Link href={backHref}>
              <ArrowLeft className="size-4" />
              Back
            </Link>
          </Button>

          {/* Body: actions + stepper (narrow, sticky left) · content (wide right) */}
          <div className="grid gap-6 lg:grid-cols-[minmax(280px,1fr)_4fr]">
            {/* Left: actions on top, vertical stepper below — sticky, first on mobile */}
            <div className="flex flex-col gap-6 lg:sticky lg:top-20 lg:self-start">
              <OrderActionsPanel order={order} funding={funding.data} />
              <OrderStepper
                orderStatus={order.status}
                escrowStatus={escrowStatus}
                role={order.role}
              />
            </div>

            {/* Right: counterparty → products → dispute */}
            <div className="flex flex-col gap-6">
              <OrderSummaryCard order={order} />
              <OrderProductsTable order={order} />
              {shouldShowDisputePanel(order) && <OrderDisputePanel order={order} />}
            </div>
          </div>
        </div>
      );
    })
    .otherwise(() => null);
}
