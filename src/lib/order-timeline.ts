import type { EscrowStatus } from "@/db/enums";
import type { OrderRole } from "@/lib/backend/query-orders";

/**
 * Derives a human-readable, role-aware view of where an order is in its lifecycle. Used by the
 * order stepper and the dispute detail to render "a che punto siamo / cosa devo fare ora" without
 * the consumer having to re-implement the (orderStatus, escrowStatus) decision tree that the
 * action buttons in `order-detail.tsx` already encode.
 */

export type TimelineStepKey = "payment" | "fundLocked" | "keysDelivered" | "release" | "completed";

export type TimelineStep = { key: TimelineStepKey; label: string };

/** The happy-path stages, in order. The dispute branch is reported separately. */
export const HAPPY_PATH_STEPS: TimelineStep[] = [
  { key: "payment", label: "Pagamento" },
  { key: "fundLocked", label: "Fondi bloccati" },
  { key: "keysDelivered", label: "Chiavi consegnate" },
  { key: "release", label: "Rilascio" },
  { key: "completed", label: "Completato" },
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
  if (escrow === "completed") return "Disputa conclusa — fondi rilasciati";
  if (escrow === "refunded") return "Disputa conclusa — fondi rimborsati";
  if (escrow === "settling") return "Liquidazione in corso";
  if (orderStatus === "concluded") return "Disputa decisa — liquidazione on-chain in sospeso";
  return "In disputa — in attesa della decisione dell'admin";
}

function nextActionFor({ orderStatus, escrowStatus, role }: TimelineInput): string {
  const isBuyer = role === "buyer";

  if (orderStatus === "cancelled") return "Ordine annullato.";
  if (escrowStatus === "completed") return "Ordine completato: fondi rilasciati al venditore.";
  if (escrowStatus === "refunded") return "Fondi rimborsati all'acquirente.";

  const dispute = disputeLabelFor(orderStatus, escrowStatus);
  if (dispute) return dispute;

  switch (escrowStatus) {
    case "awaitingFunds":
    case "partiallyFunded":
      return isBuyer
        ? "Invia i fondi all'indirizzo escrow, poi verifica il pagamento."
        : "In attesa che l'acquirente blocchi i fondi nell'escrow.";
    case "fundLocked":
      if (orderStatus === "completed") {
        return isBuyer
          ? "Chiavi consegnate. In attesa che il venditore prepari il rilascio."
          : "Prepara il rilascio dei fondi.";
      }
      return isBuyer
        ? "Fondi bloccati. In attesa della consegna delle chiavi."
        : "Conferma l'ordine e prepara il rilascio.";
    case "sellerReady":
      return isBuyer
        ? "Collabora al rilascio per liberare i fondi."
        : "In attesa che l'acquirente collabori al rilascio.";
    case "buyerCheckpointsSigned":
      return isBuyer
        ? "In attesa che il venditore incassi i fondi."
        : "Incassa i fondi per completare l'ordine.";
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
