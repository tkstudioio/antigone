"use client";

import { useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { InputGroup, InputGroupButton, InputGroupInput } from "@/components/ui/input-group";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { ArrowDownToLine, Copy, Check, CloudOff } from "lucide-react";
import useProfileStore from "@/stores/profile";

type AddressKind = "ark" | "onchain" | "bip21";

type AddressOption = {
  kind: AddressKind;
  tab: string;
  label: string;
  badge: string;
  hint: string;
  value: string | null;
};

function CopyButton({ text, label }: { text: string; label: string }) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <InputGroupButton size="sm" onClick={handleCopy} aria-label={`Copy ${label}`}>
      {copied ? <Check className="text-positive" /> : <Copy />}
      <span aria-live="polite">{copied ? "Copied" : "Copy"}</span>
    </InputGroupButton>
  );
}

export function ReceiveDialog() {
  const { addresses } = useProfileStore();
  const [selected, setSelected] = useState<AddressKind>("ark");

  const bip21Uri =
    addresses?.boardingAddress && addresses.offchainAddress
      ? `bitcoin:${addresses?.boardingAddress}?ark=${addresses?.offchainAddress}`
      : null;

  const options = (
    [
      {
        kind: "ark",
        tab: "Ark",
        label: "Ark address",
        badge: "off-chain · instant",
        hint: "For payments from Arkade wallets: instant and off-chain.",
        value: addresses?.offchainAddress ?? null,
      },
      {
        kind: "onchain",
        tab: "On-chain",
        label: "Boarding address (on-chain)",
        badge: "on-chain · Bitcoin",
        hint: "For payments from any Bitcoin wallet. Funds show up under Onboarding first.",
        value: addresses?.boardingAddress ?? null,
      },
      {
        kind: "bip21",
        tab: "Universal",
        label: "Full BIP21 URI",
        badge: "universal",
        hint: "Ark-aware wallets pay off-chain to the Ark address; other wallets pay on-chain.",
        value: bip21Uri,
      },
    ] satisfies AddressOption[]
  ).filter((option): option is AddressOption & { value: string } => option.value !== null);

  const current = options.find((option) => option.kind === selected) ?? options[0];

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button action={"positive"} className="flex-1 font-semibold">
          <ArrowDownToLine />
          Receive
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-[calc(100%-2rem)] sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Receive Bitcoin</DialogTitle>
          <DialogDescription>Show the QR code to the payer, or copy the address.</DialogDescription>
        </DialogHeader>

        {!current ? (
          <Alert action="negative">
            <CloudOff />
            <AlertDescription>
              Addresses unavailable: the Arkade server is unreachable. Try again later.
            </AlertDescription>
          </Alert>
        ) : (
          <div className="space-y-6">
            {options.length > 1 && (
              <SegmentedControl
                aria-label="Address type"
                value={current.kind}
                onValueChange={setSelected}
                options={options.map((option) => ({ value: option.kind, label: option.tab }))}
              />
            )}

            {/* QR codes need dark-on-light with a quiet zone to scan reliably, in both themes. */}
            <div className="mx-auto w-full max-w-64 rounded-md bg-white p-4">
              <QRCodeSVG
                value={current.value}
                size={256}
                level="M"
                marginSize={0}
                bgColor="#ffffff"
                fgColor="#000000"
                title={`QR code of your ${current.label}`}
                className="block h-auto w-full"
              />
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-medium">{current.label}</span>
                <Badge action="muted" variant="outline" className="font-mono text-xs">
                  {current.badge}
                </Badge>
              </div>
              <InputGroup>
                <InputGroupInput
                  readOnly
                  value={current.value}
                  aria-label={current.label}
                  className="font-mono text-xs"
                />
                <CopyButton text={current.value} label={current.label} />
              </InputGroup>
              <p className="text-sm text-muted-foreground">{current.hint}</p>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
