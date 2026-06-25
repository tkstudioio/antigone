"use client";

import { useEffect } from "react";
import { Loader2 } from "lucide-react";
import { useQueryClient, useIsFetching } from "@tanstack/react-query";

import {
  useConfirmAndPrepareRelease,
  usePrepareRelease,
  useCollaborateRelease,
  useFinalizeRelease,
  useOpenDispute,
  useFinalizeDisputeSettlement,
  useSettleDispute,
  type EscrowFundingData,
} from "@/hooks/orders";
import { useSendPayment } from "@/hooks/wallet";
import type { OrderDetail } from "@/lib/backend/query-orders";
import { ESCROW_STATUS_LABELS, type EscrowStatus } from "@/lib/escrow-status";
import { EscrowFundingBar } from "@/components/escrow-funding-bar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { match, P as Pattern } from "ts-pattern";
import { P } from "./ui/typography";

type Props = {
  order: OrderDetail;
  funding: EscrowFundingData | undefined;
};

export function OrderActionsPanel({ order, funding }: Props) {
  const queryClient = useQueryClient();
  const isFetchingOrder = useIsFetching({ queryKey: ["orders", "detail", order.id] }) > 0;

  const confirmAndPrepare = useConfirmAndPrepareRelease();
  const prepareRelease = usePrepareRelease();
  const collaborateRelease = useCollaborateRelease();
  const finalizeRelease = useFinalizeRelease();
  const openDispute = useOpenDispute();
  const finalizeDisputeSettlement = useFinalizeDisputeSettlement();
  const settleDispute = useSettleDispute();
  const sendPayment = useSendPayment();

  const releaseBusy =
    confirmAndPrepare.isPending ||
    prepareRelease.isPending ||
    collaborateRelease.isPending ||
    finalizeRelease.isPending ||
    openDispute.isPending ||
    finalizeDisputeSettlement.isPending ||
    settleDispute.isPending ||
    sendPayment.isPending;

  const escrow = order.escrow;
  const escrowStatus = escrow?.status as EscrowStatus | undefined;
  const role = order.role;

  const isAwaitingPayment =
    role === "buyer" && (escrowStatus === "awaitingFunds" || escrowStatus === "partiallyFunded");

  // Poll the order every 1.5s while the buyer is waiting to confirm payment landed.
  useEffect(() => {
    if (!isAwaitingPayment) return;
    const id = setInterval(() => {
      queryClient.invalidateQueries({ queryKey: ["orders", "detail", order.id] });
    }, 1500);
    return () => clearInterval(id);
  }, [isAwaitingPayment, order.id, queryClient]);

  const favouredRole =
    order.favouredRole === "buyer" || order.favouredRole === "seller"
      ? order.favouredRole
      : order.conclusionStatus === "completed"
        ? "seller"
        : "buyer";
  const isFavoured = order.status === "concluded" && role === favouredRole;

  // Suffix " on <date>" appended to the terminal-state messages when the release timestamp is known.
  const settledAtSuffix = escrow?.releasedAt
    ? ` on ${new Date(escrow.releasedAt).toLocaleString("en-US")}`
    : "";

  return (
    <Card>
      <CardHeader className="relative pb-2">
        <div className="flex items-center gap-2 ">
          <CardTitle className="text-base">#{order.id}</CardTitle>
          <Badge variant="solid" action="muted" className="w-max relative items-center gap-1">
            {order.escrow?.status
              ? (ESCROW_STATUS_LABELS[order.escrow?.status as EscrowStatus] ?? escrow!.status)
              : null}
            <Loader2
              className={cn("size-3.5 animate-spin invisible", {
                visible: isFetchingOrder,
              })}
            />
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {/* Live funding bar — hidden once funds leave the escrow. */}
        {funding && escrowStatus !== "completed" && escrowStatus !== "refunded" && (
          <EscrowFundingBar
            total={funding.total}
            price={funding.price}
            expiresAt={funding.expiresAt}
            expirySoon={funding.expirySoon}
            swept={funding.swept}
          />
        )}

        {match({
          orderStatus: order.status,
          escrowStatus,
          role,
          isFavoured,
          conclusionStatus: order.conclusionStatus,
        })
          // Cancelled by the admin: terminal state, no action (precedes the role branches to
          // avoid showing "Pay" on a cancelled order whose escrow is still unfunded).
          .with({ orderStatus: "cancelled" }, () => <P>Order cancelled.</P>)
          // ── Buyer ──
          .with(
            { role: "buyer", escrowStatus: Pattern.union("awaitingFunds", "partiallyFunded") },
            () => (
              <Button
                className="w-full"
                disabled={releaseBusy}
                onClick={async () => {
                  await sendPayment.mutateAsync({
                    destination: escrow!.address,
                    amount: escrow!.price - (funding?.total ?? 0),
                  });
                  queryClient.invalidateQueries({
                    queryKey: ["orders", "detail", order.id],
                  });
                }}
              >
                Pay
              </Button>
            )
          )
          .with({ role: "buyer", escrowStatus: "fundLocked" }, () => (
            <Button
              variant="outline"
              className="w-full"
              disabled={releaseBusy}
              onClick={() =>
                openDispute.mutateAsync({
                  orderId: order.id,
                  chatId: order.chatId,
                  adminPubkey: escrow?.arbiterPubkey ?? null,
                })
              }
            >
              Open dispute
            </Button>
          ))
          .with({ role: "buyer", escrowStatus: "sellerReady" }, () => (
            <Button
              className="w-full"
              disabled={releaseBusy}
              onClick={() => collaborateRelease.mutateAsync(order)}
            >
              Collaborate on release
            </Button>
          ))
          .with({ role: "buyer", escrowStatus: "buyerCheckpointsSigned" }, () => (
            <P>Waiting for the seller to collect the funds.</P>
          ))
          // ── Seller ──
          .with(
            { role: "seller", escrowStatus: Pattern.union("awaitingFunds", "partiallyFunded") },
            () => <P>Waiting for the buyer to lock all the funds.</P>
          )
          .with({ role: "seller", escrowStatus: "sellerReady" }, () => (
            <Button
              variant="outline"
              className="w-full"
              disabled={releaseBusy}
              onClick={() =>
                openDispute.mutateAsync({
                  orderId: order.id,
                  chatId: order.chatId,
                  adminPubkey: escrow?.arbiterPubkey ?? null,
                })
              }
            >
              Open dispute
            </Button>
          ))
          .with({ role: "seller", escrowStatus: "buyerCheckpointsSigned" }, () => (
            <Button
              className="w-full"
              disabled={releaseBusy}
              onClick={() => finalizeRelease.mutateAsync(order)}
            >
              Collect funds
            </Button>
          ))
          .with({ role: "seller", escrowStatus: "fundLocked", orderStatus: "completed" }, () => (
            <Button
              className="w-full"
              disabled={releaseBusy}
              onClick={() => prepareRelease.mutateAsync(order)}
            >
              Prepare release
            </Button>
          ))
          .with({ role: "seller", escrowStatus: "fundLocked" }, () => (
            <Button
              className="w-full"
              disabled={releaseBusy}
              onClick={() => confirmAndPrepare.mutateAsync(order)}
            >
              Confirm and prepare release
            </Button>
          ))
          // ── Dispute / settlement (both roles) ──
          // Dispute open, awaiting the admin verdict (order + escrow = disputed).
          .with({ orderStatus: "disputed", escrowStatus: "disputed" }, () => (
            <P>Waiting for the administrator&apos;s decision.</P>
          ))
          // Verdict issued (order = concluded) and escrow still disputed → on-chain settlement.
          // The favoured party (buyer or seller) drives the settlement.
          .with({ orderStatus: "concluded", escrowStatus: "disputed", isFavoured: true }, () => (
            <Button
              className="w-full"
              disabled={releaseBusy}
              onClick={() => settleDispute.mutateAsync(order)}
            >
              Settle and complete
            </Button>
          ))
          .with({ orderStatus: "concluded", escrowStatus: "disputed" }, () => (
            <P>Waiting for the counterparty to settle the dispute.</P>
          ))
          .with({ escrowStatus: "settling", isFavoured: true }, () => (
            <Button
              className="w-full"
              disabled={releaseBusy}
              onClick={() => finalizeDisputeSettlement.mutateAsync(order)}
            >
              Complete settlement
            </Button>
          ))
          .with({ escrowStatus: "settling" }, () => <P>Settlement in progress.</P>)
          // ── Terminal states (both roles) ──
          .with({ escrowStatus: "completed" }, () => (
            <P>Funds released to the seller{settledAtSuffix}.</P>
          ))
          .with({ escrowStatus: "refunded", conclusionStatus: "partially_refunded" }, () => (
            <P>Funds partially refunded{settledAtSuffix}.</P>
          ))
          .with({ escrowStatus: "refunded" }, () => <P>Funds refunded{settledAtSuffix}.</P>)
          .with({ escrowStatus: "expiredSwept" }, () => (
            <P>The funds have expired and were recovered by the operator.</P>
          ))
          .with({ role: undefined }, () => <P>Role not defined.</P>)
          .otherwise(() => null)}
      </CardContent>
    </Card>
  );
}
