"use client";

import { toast } from "react-toastify";
import { CalendarCheck, CalendarPlus, CopyIcon, Gavel, User } from "lucide-react";

import type { OrderDetail } from "@/lib/backend/query-orders";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { InputGroup, InputGroupButton, InputGroupInput } from "@/components/ui/input-group";

type Props = {
  order: OrderDetail;
};

/** Label / value row used inside the summary card. */
function InfoRow({
  icon: Icon,
  label,
  children,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-4 py-1.5 text-sm">
      <span className="flex items-center gap-2 text-muted-foreground">
        <Icon className="size-4 shrink-0 opacity-70" />
        {label}
      </span>
      <span className="text-right font-medium text-foreground">{children}</span>
    </div>
  );
}

/**
 * "Summary" card: the order counterparty (with a copyable pubkey) and the order's key dates
 * (created / completed / concluded). Purely informative — no actions live here.
 */
export function OrderSummaryCard({ order }: Props) {
  const counterparty = order.role === "buyer" ? order.seller : order.buyer;
  const counterpartyRole = order.role === "buyer" ? "Seller" : "Buyer";

  async function copyPubkey() {
    try {
      await navigator.clipboard.writeText(counterparty.pubkey);
      toast.success("Public key copied");
    } catch {
      toast.error("Failed to copy the public key");
    }
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle>Summary</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <div className="flex items-center gap-3">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-fill ring-1 ring-foreground/10">
            <User className="size-5 text-muted-foreground" />
          </div>
          <div className="flex min-w-0 flex-col">
            <span className="text-xs uppercase tracking-wide text-muted-foreground">
              {counterpartyRole}
            </span>
            <span className="truncate font-medium">{counterparty.username}</span>
          </div>
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                onClick={copyPubkey}
                className="ml-auto flex items-center gap-1 font-mono text-xs text-muted-foreground transition-colors hover:text-foreground"
                aria-label="Copy public key"
              >
                {counterparty.pubkey.slice(0, 8)}…{counterparty.pubkey.slice(-6)}
                <CopyIcon className="size-3" />
              </button>
            </TooltipTrigger>
            <TooltipContent>
              <InputGroup>
                <InputGroupInput readOnly value={counterparty.pubkey} />
                <InputGroupButton onClick={copyPubkey} aria-label="Copy public key">
                  <CopyIcon />
                </InputGroupButton>
              </InputGroup>
            </TooltipContent>
          </Tooltip>
        </div>

        <div className="border-t pt-2">
          <InfoRow icon={CalendarPlus} label="Created on">
            {new Date(order.createdAt).toLocaleDateString("en-US")}
          </InfoRow>
          {order.completedAt && (
            <InfoRow icon={CalendarCheck} label="Completed on">
              {new Date(order.completedAt).toLocaleDateString("en-US")}
            </InfoRow>
          )}
          {order.concludedAt && (
            <InfoRow icon={Gavel} label="Concluded on">
              {new Date(order.concludedAt).toLocaleDateString("en-US")}
            </InfoRow>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
