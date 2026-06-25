"use client";

import type { OrderDetail } from "@/lib/backend/query-orders";
import {
  CONCLUSION_STATUS_LABELS,
  CONCLUSION_STATUS_BADGE,
  type ConclusionStatus,
} from "@/lib/orders-status";
import { canOpenDispute, type EscrowStatus } from "@/lib/escrow-status";
import { formatPrice } from "@/lib/utils";
import { OrderChatThread } from "@/components/order-chat-thread";
import { Badge, type BadgeStyle } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";

/** Neutral fallback for statuses without an explicit badge style. */
const DEFAULT_BADGE: BadgeStyle = { action: "muted", variant: "outline" };

type Props = {
  order: OrderDetail;
};

/**
 * Whether the dispute panel should be rendered at all: there is a chat (a dispute has been opened,
 * or one is ongoing/concluded) or a dispute can still be opened from the actions sidebar.
 */
export function shouldShowDisputePanel(order: OrderDetail): boolean {
  return (
    order.chatId != null ||
    canOpenDispute(order.status, order.escrow?.status as EscrowStatus | undefined)
  );
}

function BreakdownRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between py-1.5 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium">{value}</span>
    </div>
  );
}

/**
 * Full-width "Dispute" panel. Purely informative: dispute outcome badge, refund breakdown
 * (who got what), per-item refund status, and the inline buyer ↔ seller ↔ admin chat. Actions
 * (open / settle a dispute) live in the sidebar, never here.
 */
export function OrderDisputePanel({ order }: Props) {
  const isConcluded = order.status === "concluded";
  const conclusionLabel =
    order.conclusionStatus != null
      ? (CONCLUSION_STATUS_LABELS[order.conclusionStatus as ConclusionStatus] ??
        order.conclusionStatus)
      : null;
  const conclusionBadge =
    order.conclusionStatus != null
      ? (CONCLUSION_STATUS_BADGE[order.conclusionStatus as ConclusionStatus] ?? DEFAULT_BADGE)
      : DEFAULT_BADGE;

  // The platform fee was paid by the buyer on top of the goods price; only the buyer refund and the
  // admin's arbitration share reduce the seller's share of the goods pot (totalSats).
  const sellerShare = order.totalSats - (order.refundAmount ?? 0) - (order.adminDisputeShare ?? 0);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
        <CardTitle className="text-base">Dispute</CardTitle>
        {isConcluded && <Badge {...conclusionBadge}>{conclusionLabel ?? "—"}</Badge>}
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {isConcluded && (
          <div className="flex flex-col gap-3">
            <div>
              <BreakdownRow
                label="Buyer refund"
                value={order.refundAmount != null ? formatPrice(order.refundAmount) : "—"}
              />
              {order.platformFee > 0 && (
                <BreakdownRow label="Platform fee" value={formatPrice(order.platformFee)} />
              )}
              {order.adminDisputeShare != null && order.adminDisputeShare > 0 && (
                <BreakdownRow
                  label="Admin dispute share"
                  value={formatPrice(order.adminDisputeShare)}
                />
              )}
              <BreakdownRow label="Seller share" value={formatPrice(sellerShare)} />
              {order.concludedAt && (
                <BreakdownRow
                  label="Concluded on"
                  value={new Date(order.concludedAt).toLocaleString("en-US")}
                />
              )}
            </div>

            <div className="flex flex-col gap-1">
              <span className="text-xs text-muted-foreground">Items</span>
              {order.items.map((item) => (
                <div key={item.keyId} className="flex items-center justify-between gap-2 text-sm">
                  <span>{item.productName}</span>
                  <Badge
                    action={item.refunded ? "positive" : "muted"}
                    variant={item.refunded ? "solid" : "outline"}
                  >
                    {item.refunded ? "Refunded" : "Not refunded"}
                  </Badge>
                </div>
              ))}
            </div>

            <Separator />
          </div>
        )}

        {/* Inline chat (buyer ↔ seller ↔ admin) once a dispute exists; otherwise a hint. */}
        {order.chatId != null ? (
          <OrderChatThread chatId={order.chatId} order={order} />
        ) : (
          <p className="text-sm text-muted-foreground">
            Open a dispute from the actions column to communicate with the counterparty about this
            order.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
