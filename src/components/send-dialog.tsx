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
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Badge, type BadgeStyle } from "@/components/ui/badge";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
  InputGroupText,
} from "@/components/ui/input-group";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { CameraQrScanner } from "@/components/camera-qr-scanner";
import { toast } from "react-toastify";
import {
  ArrowUpFromLine,
  CircleAlert,
  ClipboardPaste,
  Info,
  Loader2,
  ScanQrCode,
  TextCursorInput,
} from "lucide-react";

/**
 * QR encoders often upper-case the whole payload (bech32 is case-insensitive and upper case
 * fits the denser alphanumeric QR mode), while `parseBIP21Address` expects lower case.
 */
function normalizeScanned(text: string): string {
  const trimmed = text.trim();
  if (trimmed === trimmed.toUpperCase()) return trimmed.toLowerCase();
  return trimmed.replace(/^bitcoin:/i, "bitcoin:");
}

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
  const [inputMode, setInputMode] = useState<"paste" | "scan">("paste");
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

  async function pasteFromClipboard() {
    try {
      setDestination((await navigator.clipboard.readText()).trim());
    } catch {
      toast.error("Clipboard access was denied: paste the address into the field instead.");
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        // Never reopen straight into the camera.
        if (!next) setInputMode("paste");
      }}
    >
      <DialogTrigger asChild>
        <Button variant={"outline"} action={"muted"} className="flex-1 font-semibold">
          <ArrowUpFromLine />
          Send
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-[calc(100%-2rem)] sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Send Bitcoin</DialogTitle>
          <DialogDescription>Enter an address and an amount to send Bitcoin.</DialogDescription>
        </DialogHeader>
        <div className="space-y-6">
          <FieldGroup className="gap-6">
            <Field>
              <div className="flex items-center justify-between gap-2">
                <FieldLabel htmlFor="send-destination">Destination</FieldLabel>
                {parsed ? (
                  <Badge
                    className="text-xs"
                    action={TYPE_LABELS[parsed.type]?.action ?? "muted"}
                    variant={TYPE_LABELS[parsed.type]?.variant ?? "outline"}
                  >
                    {TYPE_LABELS[parsed.type]?.label ?? parsed.type}
                  </Badge>
                ) : destination.trim() ? (
                  <Badge className="text-xs" action="negative" variant="solid">
                    Address not recognized
                  </Badge>
                ) : null}
              </div>
              <SegmentedControl
                aria-label="How to enter the destination"
                value={inputMode}
                onValueChange={setInputMode}
                options={[
                  {
                    value: "paste",
                    label: (
                      <>
                        <TextCursorInput aria-hidden />
                        Enter address
                      </>
                    ),
                  },
                  {
                    value: "scan",
                    label: (
                      <>
                        <ScanQrCode aria-hidden />
                        Scan QR code
                      </>
                    ),
                  },
                ]}
              />
              {inputMode === "scan" ? (
                <CameraQrScanner
                  onResult={(text) => {
                    setDestination(normalizeScanned(text));
                    setInputMode("paste");
                  }}
                  onPasteInstead={() => setInputMode("paste")}
                />
              ) : (
                <InputGroup>
                  <InputGroupInput
                    id="send-destination"
                    placeholder="Ark, Bitcoin, BIP21 or Lightning address..."
                    value={destination}
                    onChange={(e) => setDestination(e.target.value)}
                    aria-invalid={!parsed && !!destination.trim()}
                    autoComplete="off"
                    spellCheck={false}
                    className="font-mono text-xs"
                  />
                  <InputGroupAddon align="inline-end">
                    <InputGroupButton size="sm" onClick={pasteFromClipboard}>
                      <ClipboardPaste />
                      Paste
                    </InputGroupButton>
                  </InputGroupAddon>
                </InputGroup>
              )}
            </Field>

            {parsed && !parsed.amount && (
              <Field>
                <FieldLabel htmlFor="send-amount">Amount</FieldLabel>
                <InputGroup>
                  <InputGroupInput
                    id="send-amount"
                    type="number"
                    inputMode="numeric"
                    placeholder="e.g. 10000"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    min={1}
                    className="tabular-nums"
                  />
                  <InputGroupAddon align="inline-end">
                    <InputGroupText>sats</InputGroupText>
                  </InputGroupAddon>
                </InputGroup>
              </Field>
            )}

            {parsed?.amount && (
              <FieldDescription>
                Amount from URI:{" "}
                <strong className="text-foreground tabular-nums">
                  {parsed.amount.toLocaleString("en-US")} sats
                </strong>
              </FieldDescription>
            )}
          </FieldGroup>

          {parsed?.type === "onchain" && (
            <Alert action="muted">
              <Info />
              <AlertDescription>
                On-chain address: the funds leave Arkade via <strong>offboard</strong>{" "}
                (collaborative exit settled on-chain). It may take longer than an Ark send.
              </AlertDescription>
            </Alert>
          )}

          {send.error && (
            <Alert action="negative">
              <CircleAlert />
              <AlertDescription>{(send.error as Error).message}</AlertDescription>
            </Alert>
          )}

          <Button
            size="lg"
            className="w-full font-semibold"
            onClick={() => void handleSend().catch(() => {})}
            disabled={!canSend}
          >
            {send.isPending && <Loader2 className="animate-spin" />}
            {send.isPending ? "Sending..." : "Send"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
