import type { BadgeStyle } from "@/components/ui/badge";
import type { ConclusionStatus, OrderStatus } from "@/db/enums";

export type { ConclusionStatus, OrderStatus };

export const ORDER_STATUS_LABELS: Record<OrderStatus, string> = {
  pending: "In attesa",
  funded: "Finanziato",
  completed: "Completato",
  disputed: "In disputa",
  refunded: "Rimborsato",
  cancelled: "Annullato",
  concluded: "Conclusa",
};

export const ORDER_STATUS_BADGE: Record<OrderStatus, BadgeStyle> = {
  pending: { action: "muted", variant: "outline" },
  funded: { action: "primary", variant: "outline" },
  completed: { action: "positive", variant: "solid" },
  disputed: { action: "negative", variant: "solid" },
  refunded: { action: "muted", variant: "solid" },
  cancelled: { action: "negative", variant: "outline" },
  concluded: { action: "primary", variant: "solid" },
};

export const CONCLUSION_STATUS_LABELS: Record<ConclusionStatus, string> = {
  completed: "Completato",
  partially_refunded: "Parzialmente rimborsato",
  cancelled: "Annullato",
};

export const CONCLUSION_STATUS_BADGE: Record<ConclusionStatus, BadgeStyle> = {
  completed: { action: "positive", variant: "solid" },
  partially_refunded: { action: "muted", variant: "solid" },
  cancelled: { action: "negative", variant: "solid" },
};

/**
 * Derive the dispute conclusion status from how many keys are being refunded:
 * none → `completed` (seller keeps everything), all → `cancelled` (full refund), some →
 * `partially_refunded`. Single source of truth shared by the conclude dialog (UI) and the backend
 * (server-side consistency check). `totalCount === 0` falls back to `completed`.
 */
export function deriveConclusionStatus(
  refundedCount: number,
  totalCount: number
): ConclusionStatus {
  if (totalCount === 0 || refundedCount === 0) return "completed";
  if (refundedCount >= totalCount) return "cancelled";
  return "partially_refunded";
}
