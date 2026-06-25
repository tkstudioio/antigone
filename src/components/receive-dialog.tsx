"use client";

import { useState } from "react";
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
import { Badge } from "@/components/ui/badge";
import { ArrowDownToLine, Copy, Check } from "lucide-react";
import useProfileStore from "@/stores/profile";

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <Button onClick={handleCopy}>
      {copied ? <Check className="size-3.5 text-green-600" /> : <Copy className="size-3.5" />}
    </Button>
  );
}

function AddressRow({
  label,
  address,
  badge,
}: {
  label: string;
  address: string | null;
  badge?: string;
}) {
  if (!address) return null;

  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-2">
        <span className="text-sm font-medium">{label}</span>
        {badge && (
          <Badge action="muted" variant="outline" className="text-xs">
            {badge}
          </Badge>
        )}
      </div>
      <div className="flex items-center gap-2">
        <Input readOnly value={address} className="font-mono text-xs h-8" />
        <CopyButton text={address} />
      </div>
    </div>
  );
}

export function ReceiveDialog() {
  const { addresses } = useProfileStore();

  const bip21Uri =
    addresses?.boardingAddress && addresses.offchainAddress
      ? `bitcoin:${addresses?.boardingAddress}?ark=${addresses?.offchainAddress}`
      : null;

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button action={"positive"} className="flex-1">
          <ArrowDownToLine className="size-4" />
          Receive
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-medium">
        <DialogHeader>
          <DialogTitle>Receive Bitcoin</DialogTitle>
          <DialogDescription>Copy an address to receive a payment.</DialogDescription>
        </DialogHeader>

        <div className="space-y-4 pt-2">
          {!addresses?.offchainAddress && !addresses?.boardingAddress && (
            <p className="text-sm text-muted-foreground">
              Addresses unavailable: the Arkade server is unreachable. Try again later.
            </p>
          )}
          {addresses?.offchainAddress && (
            <AddressRow
              label="Ark address"
              address={addresses?.offchainAddress}
              badge="off-chain • instant"
            />
          )}
          {addresses?.boardingAddress && (
            <AddressRow
              label="Boarding address (on-chain)"
              address={addresses?.boardingAddress}
              badge="on-chain • Bitcoin"
            />
          )}
          {bip21Uri && (
            <AddressRow label="Full BIP21 URI" address={bip21Uri} badge="universal" />
          )}
          <p className="text-xs text-muted-foreground">
            For Ark payments use the Ark address. For on-chain Bitcoin payments use the boarding
            address.
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
