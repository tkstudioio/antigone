"use client";

import { useState } from "react";
import { useSendPayment } from "@/hooks/wallet";
import { parseBIP21Address } from "@/lib/ark";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge, type BadgeStyle } from "@/components/ui/badge";
import { ArrowUpFromLine } from "lucide-react";

const TYPE_LABELS: Record<string, { label: string } & BadgeStyle> = {
  ark: { label: "Ark (off-chain)", action: "primary", variant: "solid" },
  bip21: { label: "BIP21 / Ark", action: "primary", variant: "solid" },
  onchain: { label: "Bitcoin on-chain", action: "muted", variant: "solid" },
  lightning: { label: "Lightning", action: "muted", variant: "outline" },
};

export function SendDialog() {
  const [open, setOpen] = useState(false);
  const [destination, setDestination] = useState("");
  const [amount, setAmount] = useState("");
  const send = useSendPayment();

  const parsed = destination.trim() ? parseBIP21Address(destination.trim()) : null;
  const parsedAmount = parsed?.amount ?? (amount ? Number(amount) : 0);
  const canSend = !!parsed && parsedAmount > 0 && !send.isPending;

  async function handleSend() {
    if (!canSend) return;
    await send.mutateAsync({ destination: destination.trim(), amount: parsedAmount });
    setOpen(false);
    setDestination("");
    setAmount("");
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant={"outline"} action={"primary"} className="flex-1">
          <ArrowUpFromLine className="size-4" />
          Send
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-medium">
        <DialogHeader>
          <DialogTitle>Send Bitcoin</DialogTitle>
          <DialogDescription>
            Enter an address and an amount to send Bitcoin.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 pt-2">
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Destination</label>
            <Input
              placeholder="Ark, Bitcoin, BIP21 or Lightning address..."
              value={destination}
              onChange={(e) => setDestination(e.target.value)}
              className="font-mono text-xs"
            />
            {parsed ? (
              <Badge
                action={TYPE_LABELS[parsed.type]?.action ?? "muted"}
                variant={TYPE_LABELS[parsed.type]?.variant ?? "outline"}
              >
                {TYPE_LABELS[parsed.type]?.label ?? parsed.type}
              </Badge>
            ) : destination.trim() ? (
              <Badge action="negative" variant="solid">
                Address not recognized
              </Badge>
            ) : null}
          </div>

          {parsed && !parsed.amount && (
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Amount (sats)</label>
              <Input
                type="number"
                placeholder="e.g. 10000"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                min={1}
              />
            </div>
          )}

          {parsed?.amount && (
            <p className="text-sm text-muted-foreground">
              Amount from URI: <strong>{parsed.amount.toLocaleString()} sats</strong>
            </p>
          )}

          {parsed?.type === "onchain" && (
            <p className="text-sm text-muted-foreground">
              On-chain address: the funds leave Arkade via <strong>offboard</strong> (collaborative
              exit settled on-chain). It may take longer than an Ark send.
            </p>
          )}

          {send.error && (
            <p className="text-sm text-destructive">{(send.error as Error).message}</p>
          )}

          <Button className="w-full" onClick={handleSend} disabled={!canSend}>
            {send.isPending ? "Sending..." : "Send"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
