import type { BadgeStyle } from "@/components/ui/badge";
import type { EscrowStatus } from "@/db/enums";

export type { EscrowStatus };

export const ESCROW_STATUS_LABELS: Record<EscrowStatus, string> = {
  awaitingFunds: "In attesa di pagamento",
  partiallyFunded: "Parzialmente finanziato",
  fundLocked: "Fondi bloccati",
  sellerReady: "Rilascio preparato",
  buyerSubmitted: "Inviato dall'acquirente",
  buyerCheckpointsSigned: "Acquirente ha collaborato",
  completed: "Rilasciato",
  disputed: "In disputa",
  settling: "Liquidazione in corso",
  refunded: "Rimborsato",
  expiredSwept: "Fondi scaduti (recuperati dall'operatore)",
};

/**
 * Escrow states in which a dispute may still be opened: funds are locked but the release is still
 * pending. Once the buyer has collaborated (`buyerCheckpointsSigned`) only the seller's finalize
 * remains, so the dispute window closes there — for BOTH parties. Mirrored server-side by
 * `DISPUTABLE_ESCROW_STATUSES` in `src/lib/backend/mutations-orders.ts` (the authoritative gate).
 */
export const DISPUTABLE_ESCROW_STATUSES: EscrowStatus[] = ["fundLocked", "sellerReady"];

/** Whether a dispute can still be opened for an order, given its order + escrow status. */
export function canOpenDispute(
  orderStatus: string,
  escrowStatus: EscrowStatus | undefined
): boolean {
  return (
    orderStatus !== "disputed" &&
    orderStatus !== "concluded" &&
    escrowStatus != null &&
    DISPUTABLE_ESCROW_STATUSES.includes(escrowStatus)
  );
}

export const ESCROW_STATUS_BADGE: Record<EscrowStatus, BadgeStyle> = {
  awaitingFunds: { action: "muted", variant: "outline" },
  partiallyFunded: { action: "muted", variant: "outline" },
  fundLocked: { action: "primary", variant: "outline" },
  sellerReady: { action: "primary", variant: "outline" },
  buyerSubmitted: { action: "primary", variant: "outline" },
  buyerCheckpointsSigned: { action: "primary", variant: "outline" },
  completed: { action: "positive", variant: "solid" },
  disputed: { action: "negative", variant: "solid" },
  settling: { action: "primary", variant: "outline" },
  refunded: { action: "muted", variant: "solid" },
  expiredSwept: { action: "negative", variant: "solid" },
};
