"use client";

import { TriangleAlert } from "lucide-react";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogMedia,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useAcknowledgeArbiter } from "@/hooks/orders";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The arbiter this browser first trusted. */
  pinned: string;
  /** The (different) arbiter the escrow names. */
  seen: string;
};

function Key({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-xs uppercase tracking-wide text-muted-foreground">{label}</span>
      <span className="break-all font-mono text-xs text-foreground">{value}</span>
    </div>
  );
}

/**
 * Prominent warning shown when an escrow names an arbiter other than the one this browser pinned on
 * first use (TOFU). Paying and signing on the order stay disabled until the user explicitly
 * acknowledges the new key. "Not now" keeps them disabled.
 */
export function ArbiterChangeDialog({ open, onOpenChange, pinned, seen }: Props) {
  const acknowledge = useAcknowledgeArbiter();

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogMedia>
            <TriangleAlert className="size-6 text-destructive" />
          </AlertDialogMedia>
          <AlertDialogTitle>The arbiter of this order has changed</AlertDialogTitle>
          <AlertDialogDescription>
            The arbiter can co-sign the settlement of a dispute. This order names a different
            arbiter than the one this browser trusted the first time. If you did not expect this,
            the platform may have been compromised: do not pay or sign anything on this order.
          </AlertDialogDescription>
        </AlertDialogHeader>

        <div className="flex flex-col gap-3 rounded-md bg-muted p-3">
          <Key label="Trusted arbiter" value={pinned} />
          <Key label="Arbiter named by this order" value={seen} />
        </div>

        <AlertDialogFooter>
          <AlertDialogCancel>Not now</AlertDialogCancel>
          <AlertDialogAction
            disabled={acknowledge.isPending}
            onClick={(event) => {
              // Keep the dialog open until the acknowledgement was actually stored.
              event.preventDefault();
              acknowledge.mutate(seen, { onSuccess: () => onOpenChange(false) });
            }}
          >
            I understand, accept this arbiter
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
