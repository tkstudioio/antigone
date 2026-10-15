import type { EscrowStatus } from "@/db/enums";
import type { OrderRole } from "@/lib/backend/query-orders";

/**
 * Derives a human-readable, role-aware view of where an order is in its lifecycle. Used by the
 * order stepper and the dispute detail to render "where are we / what do I do now" without
 * the consumer having to re-implement the (orderStatus, escrowStatus) decision tree that the
 * action buttons in `order-detail.tsx` already encode.
 */

export type TimelineStepKey = "payment" | "fundLocked" | "keysDelivered" | "release" | "completed";

export type TimelineStep = { key: TimelineStepKey; label: string };

/** The happy-path stages, in order. The dispute branch is reported separately. */
export const HAPPY_PATH_STEPS: TimelineStep[] = [
  { key: "payment", label: "Payment" },
  { key: "fundLocked", label: "Funds locked" },
  { key: "keysDelivered", label: "Keys delivered" },
  { key: "release", label: "Release" },
  { key: "completed", label: "Completed" },
];

export type OrderTimeline = {
  steps: TimelineStep[];
  /** Index of the step currently in progress; every step before it is complete. `steps.length` when all done. */
  currentIndex: number;
  /** True while the order is (or has been) in dispute and the chat/arbitration is still relevant. */
  isDispute: boolean;
  /** Short label describing the dispute stage, or null on the happy path. */
  disputeLabel: string | null;
  /** Role-aware description of the next action / waiting state for the viewer. */
  nextAction: string;
};

type TimelineInput = {
  orderStatus: string;
  escrowStatus: EscrowStatus | undefined;
  role: OrderRole | undefined;
};

function happyPathIndex(orderStatus: string, escrow: EscrowStatus | undefined): number {
  if (escrow === "completed") return HAPPY_PATH_STEPS.length; // all done
  if (escrow === "buyerCheckpointsSigned" || escrow === "sellerReady") return 3; // release in progress
  if (escrow === "fundLocked") return orderStatus === "completed" ? 3 : 2;
  // awaitingFunds / partiallyFunded / undefined
  return 0;
}

function disputeLabelFor(orderStatus: string, escrow: EscrowStatus | undefined): string | null {
  if (orderStatus !== "disputed" && orderStatus !== "concluded") return null;
  if (escrow === "completed") return "Dispute concluded — funds released";
  if (escrow === "refunded") return "Dispute concluded — funds refunded";
  if (escrow === "settlementPrepared") return "Settlement awaiting the arbiter's co-signature";
  if (escrow === "settling") return "Settling — the favoured party has to complete it";
  if (orderStatus === "concluded") return "Dispute decided — settlement on Ark pending";
  return "In dispute — awaiting the admin's decision";
}

function nextActionFor({ orderStatus, escrowStatus, role }: TimelineInput): string {
  const isBuyer = role === "buyer";

  if (orderStatus === "cancelled") return "Order cancelled.";
  if (escrowStatus === "completed") return "Order completed: funds released to the seller.";
  if (escrowStatus === "refunded") return "Funds refunded to the buyer.";

  const dispute = disputeLabelFor(orderStatus, escrowStatus);
  if (dispute) return dispute;

  switch (escrowStatus) {
    case "awaitingFunds":
    case "partiallyFunded":
      return isBuyer
        ? "Send the funds to the escrow address, then verify the payment."
        : "Waiting for the buyer to lock the funds in the escrow.";
    case "fundLocked":
      if (orderStatus === "completed") {
        return isBuyer
          ? "Keys delivered. Waiting for the seller to prepare the release."
          : "Prepare the release of the funds.";
      }
      return isBuyer
        ? "Funds locked. Waiting for the keys to be delivered."
        : "Confirm the order and prepare the release.";
    case "sellerReady":
      return isBuyer
        ? "Collaborate on the release to free the funds."
        : "Waiting for the buyer to collaborate on the release.";
    case "buyerCheckpointsSigned":
      return isBuyer
        ? "Waiting for the seller to collect the funds."
        : "Collect the funds to complete the order.";
    default:
      return "—";
  }
}

export function orderTimeline(input: TimelineInput): OrderTimeline {
  const { orderStatus, escrowStatus } = input;
  return {
    steps: HAPPY_PATH_STEPS,
    currentIndex: happyPathIndex(orderStatus, escrowStatus),
    isDispute: orderStatus === "disputed" || orderStatus === "concluded",
    disputeLabel: disputeLabelFor(orderStatus, escrowStatus),
    nextAction: nextActionFor(input),
  };
}
