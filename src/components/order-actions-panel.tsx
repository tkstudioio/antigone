"use client";

import { useEffect } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "react-toastify";
import { useQueryClient, useIsFetching } from "@tanstack/react-query";

import {
  useConfirmAndPrepareRelease,
  usePrepareRelease,
  useCollaborateRelease,
  useFinalizeRelease,
  useOpenDispute,
  useDeliverKeys,
  usePrepareDisputeSettlement,
  useFinalizeDisputeSettlement,
  escrowParamsFrom,
  type EscrowFundingData,
  type OrderDetailView,
} from "@/hooks/orders";
import { useSendPayment } from "@/hooks/wallet";
import { deriveEscrowAddress } from "@/lib/ark/escrow";
import { assertEscrowOperator } from "@/lib/ark/operator-signer";
import { ESCROW_STATUS_LABELS, type EscrowStatus } from "@/lib/escrow-status";
import { EscrowFundingBar } from "@/components/escrow-funding-bar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { match, P as Pattern } from "ts-pattern";
import { P } from "./ui/typography";

type Props = {
  order: OrderDetailView;
  /** Funding read from the Ark indexer by this browser. */
  funding: EscrowFundingData | undefined;
  /** True when the Ark indexer cannot be reached (no figure is shown or assumed). */
  fundingUnavailable?: boolean;
};

export function OrderActionsPanel({ order, funding, fundingUnavailable }: Props) {
  const queryClient = useQueryClient();
  const isFetchingOrder = useIsFetching({ queryKey: ["orders", "detail", order.id] }) > 0;

  const confirmAndPrepare = useConfirmAndPrepareRelease();
  const prepareRelease = usePrepareRelease();
  const collaborateRelease = useCollaborateRelease();
  const finalizeRelease = useFinalizeRelease();
  const openDispute = useOpenDispute();
  const deliverKeys = useDeliverKeys();
  const prepareDisputeSettlement = usePrepareDisputeSettlement();
  const finalizeDisputeSettlement = useFinalizeDisputeSettlement();
  const sendPayment = useSendPayment();

  const releaseBusy =
    confirmAndPrepare.isPending ||
    prepareRelease.isPending ||
    collaborateRelease.isPending ||
    finalizeRelease.isPending ||
    openDispute.isPending ||
    deliverKeys.isPending ||
    prepareDisputeSettlement.isPending ||
    finalizeDisputeSettlement.isPending ||
    sendPayment.isPending;

  // Every action that signs, pays or settles stays disabled while the order fails verification
  // (signed terms / delivery / verdict, operator key, arbiter pin) or while another one is running.
  const blocked = order.verification.blocked != null;
  const actionsDisabled = releaseBusy || blocked;

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

  // The favoured party is the arbiter's SIGNED choice (server field only for legacy, unsigned verdicts).
  const verdict = order.verification.verdict;
  const favouredRole =
    verdict.status === "verified"
      ? verdict.body.favouredRole
      : order.favouredRole === "buyer" || order.favouredRole === "seller"
        ? order.favouredRole
        : order.conclusionStatus === "completed"
          ? "seller"
          : "buyer";
  // Wraps for a dispute go to the TRUSTED arbiter (the pinned one), never to a key only the server named.
  const trustedArbiterPubkey = order.verification.trustedArbiterPubkey;
  const isFavoured = order.status === "concluded" && role === favouredRole;

  // Dispute opened before the seller confirmed: the keys were never delivered. The seller can still
  // deliver them (no status change) so the verdict may let the buyer keep them.
  const needsDelivery =
    role === "seller" && order.status === "disputed" && order.items.some((i) => !i.delivered);

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
        {/* Live funding bar (read from the Ark indexer) — hidden once funds leave the escrow. */}
        {escrow && escrowStatus !== "completed" && escrowStatus !== "refunded" && (
          <>
            {funding && !fundingUnavailable && (
              <EscrowFundingBar
                total={funding.total}
                price={funding.price}
                expiresAt={funding.expiresAt}
                expirySoon={funding.expirySoon}
                swept={funding.swept}
              />
            )}
            {fundingUnavailable && <EscrowFundingBar total={0} price={escrow.price} unavailable />}
          </>
        )}

        {match({
          orderStatus: order.status,
          escrowStatus,
          role,
          isFavoured,
          needsDelivery,
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
                // The amount still due depends on what the indexer reports as locked.
                disabled={actionsDisabled || !funding || fundingUnavailable}
                onClick={async () => {
                  try {
                    // Before any funds move: the operator key must be the operator's own and the
                    // address we pay must be the one these escrow parameters derive to.
                    await assertEscrowOperator(escrow!);
                    if (deriveEscrowAddress(escrowParamsFrom(escrow!)) !== escrow!.address) {
                      throw new Error("The escrow address does not match its parameters");
                    }
                    await sendPayment.mutateAsync({
                      destination: escrow!.address,
                      amount: escrow!.price - funding!.total,
                    });
                    queryClient.invalidateQueries({
                      queryKey: ["orders", "detail", order.id],
                    });
                  } catch (err) {
                    toast.error(err instanceof Error ? err.message : "Payment failed");
                  }
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
              disabled={actionsDisabled}
              onClick={() =>
                openDispute.mutateAsync({
                  orderId: order.id,
                  chatId: order.chatId,
                  adminPubkey: trustedArbiterPubkey,
                })
              }
            >
              Open dispute
            </Button>
          ))
          .with({ role: "buyer", escrowStatus: "sellerReady" }, () => (
            <Button
              className="w-full"
              disabled={actionsDisabled}
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
              disabled={actionsDisabled}
              onClick={() =>
                openDispute.mutateAsync({
                  orderId: order.id,
                  chatId: order.chatId,
                  adminPubkey: trustedArbiterPubkey,
                })
              }
            >
              Open dispute
            </Button>
          ))
          .with({ role: "seller", escrowStatus: "buyerCheckpointsSigned" }, () => (
            <Button
              className="w-full"
              disabled={actionsDisabled}
              onClick={() => finalizeRelease.mutateAsync(order)}
            >
              Collect funds
            </Button>
          ))
          .with({ role: "seller", escrowStatus: "fundLocked", orderStatus: "completed" }, () => (
            <Button
              className="w-full"
              disabled={actionsDisabled}
              onClick={() => prepareRelease.mutateAsync(order)}
            >
              Prepare release
            </Button>
          ))
          .with({ role: "seller", escrowStatus: "fundLocked" }, () => (
            <Button
              className="w-full"
              disabled={actionsDisabled}
              onClick={() => confirmAndPrepare.mutateAsync(order)}
            >
              Confirm and prepare release
            </Button>
          ))
          // ── Dispute / settlement (both roles) ──
          // Dispute open before delivery: the seller may still deliver the keys.
          .with({ orderStatus: "disputed", escrowStatus: "disputed", needsDelivery: true }, () => (
            <>
              <P>Waiting for the administrator&apos;s decision.</P>
              <P>
                Some keys were not delivered yet. Deliver them so the verdict can let the buyer keep
                them; they are also shared with the arbiter.
              </P>
              <Button
                className="w-full"
                disabled={actionsDisabled}
                onClick={() => deliverKeys.mutateAsync(order)}
              >
                Deliver keys
              </Button>
            </>
          ))
          // Dispute open, awaiting the admin verdict (order + escrow = disputed).
          .with({ orderStatus: "disputed", escrowStatus: "disputed" }, () => (
            <P>Waiting for the administrator&apos;s decision.</P>
          ))
          // Verdict issued (order = concluded) and escrow still disputed → settlement on Ark, in three
          // steps: the favoured party prepares, the arbiter co-signs, the favoured party completes.
          .with({ orderStatus: "concluded", escrowStatus: "disputed", isFavoured: true }, () => (
            <Button
              className="w-full"
              disabled={actionsDisabled}
              onClick={() => prepareDisputeSettlement.mutateAsync(order)}
            >
              Prepare settlement
            </Button>
          ))
          .with({ orderStatus: "concluded", escrowStatus: "disputed" }, () => (
            <P>Waiting for the counterparty to prepare the settlement.</P>
          ))
          .with({ escrowStatus: "settlementPrepared" }, () => (
            <P>Waiting for the arbiter to co-sign the settlement.</P>
          ))
          .with({ escrowStatus: "settling", isFavoured: true }, () => (
            <Button
              className="w-full"
              disabled={actionsDisabled}
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
