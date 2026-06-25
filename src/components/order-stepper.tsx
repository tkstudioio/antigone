"use client";

import { Check, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";
import { orderTimeline } from "@/lib/order-timeline";
import type { EscrowStatus } from "@/db/enums";
import type { OrderRole } from "@/lib/backend/query-orders";

type Props = {
  orderStatus: string;
  escrowStatus: EscrowStatus | undefined;
  role: OrderRole | undefined;
};

/**
 * Vertical lifecycle stepper for an order. A single responsive layout: the happy-path stages are
 * listed top-to-bottom, each node (a numbered circle, or a check once complete) joined by a vertical
 * connector, with the role-aware next-action line at the bottom. Compact enough to live in the
 * narrow actions column. When the order is in dispute it shows a distinct dispute banner instead.
 */
export function OrderStepper({ orderStatus, escrowStatus, role }: Props) {
  const timeline = orderTimeline({ orderStatus, escrowStatus, role });

  if (timeline.isDispute) {
    return (
      <div className="flex flex-col gap-2 rounded-card border border-destructive/40 bg-destructive/5 p-4">
        <div className="flex items-center gap-2 text-sm font-medium text-destructive">
          <AlertTriangle className="size-4 shrink-0" />
          <span>{timeline.disputeLabel}</span>
        </div>
        <p className="text-sm text-muted-foreground">{timeline.nextAction}</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3 rounded-card border bg-card p-4">
      <ol className="flex flex-col">
        {timeline.steps.map((step, i) => {
          const isDone = i < timeline.currentIndex;
          const isActive = i === timeline.currentIndex;
          const isLast = i === timeline.steps.length - 1;
          return (
            <li key={step.key} className="flex gap-3">
              {/* Node + vertical connector */}
              <div className="flex flex-col items-center">
                <span
                  className={cn(
                    "flex size-7 shrink-0 items-center justify-center rounded-full border text-xs font-medium transition-colors",
                    isDone && "border-primary bg-primary text-primary-foreground",
                    isActive && "border-primary text-primary ring-2 ring-primary/30",
                    !isDone && !isActive && "border-muted-foreground/30 text-muted-foreground"
                  )}
                >
                  {isDone ? <Check className="size-4" /> : i + 1}
                </span>
                {!isLast && (
                  <span
                    className={cn(
                      "w-0.5 flex-1 rounded-full",
                      isDone ? "bg-primary" : "bg-muted-foreground/30"
                    )}
                  />
                )}
              </div>
              {/* Label */}
              <span
                className={cn(
                  "pt-1 text-sm leading-tight",
                  isLast ? "" : "pb-3",
                  isActive ? "font-medium text-foreground" : "text-muted-foreground"
                )}
              >
                {step.label}
              </span>
            </li>
          );
        })}
      </ol>

      <p className="border-t pt-3 text-sm text-muted-foreground">{timeline.nextAction}</p>
    </div>
  );
}
