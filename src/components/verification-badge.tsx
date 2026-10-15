"use client";

import { ShieldAlert, ShieldCheck, ShieldQuestion } from "lucide-react";

import { cn } from "@/lib/utils";
import type { VerifiedChatMessage } from "@/hooks/chat";
import type { ActionVerification } from "@/lib/order-verification";

export type VerificationStatus = "verified" | "tampered" | "legacy" | "system";

type Props = {
  status: VerificationStatus;
  /** Overrides the default text of the status. */
  label?: string;
  /** Why verification failed (shown as a tooltip via `title`). */
  reason?: string;
  className?: string;
};

const DEFAULT_LABELS: Record<VerificationStatus, string> = {
  verified: "Signature verified",
  tampered: "Unverified — possibly tampered by the server",
  legacy: "Unverified (legacy)",
  system: "Platform (unverified)",
};

/**
 * Compact trust indicator for a record the browser checked (or could not check) against its
 * author's signature: verified, failed verification (possibly tampered by the server), unsigned
 * legacy data, or platform-authored data that cannot be verified by design.
 */
export function VerificationBadge({ status, label, reason, className }: Props) {
  const text = label ?? DEFAULT_LABELS[status];
  const Icon =
    status === "verified" ? ShieldCheck : status === "tampered" ? ShieldAlert : ShieldQuestion;

  return (
    <span
      title={reason}
      className={cn(
        "inline-flex items-center gap-1 text-xs leading-none",
        status === "verified" && "text-positive",
        status === "tampered" && "font-medium text-destructive",
        (status === "legacy" || status === "system") && "text-muted-foreground",
        className
      )}
    >
      <Icon className="size-3 shrink-0" aria-hidden />
      {text}
    </span>
  );
}

/**
 * Badge for the outcome of verifying one signed action of an order. Renders nothing for a step
 * that has not happened. `verifiedLabel` says what was verified ("Confirmed by seller — signature
 * verified").
 */
export function ActionVerificationBadge({
  verification,
  verifiedLabel,
  className,
}: {
  verification: ActionVerification<unknown>;
  verifiedLabel: string;
  className?: string;
}) {
  if (verification.status === "none") return null;
  if (verification.status === "verified") {
    return <VerificationBadge status="verified" label={verifiedLabel} className={className} />;
  }
  if (verification.status === "tampered") {
    return (
      <VerificationBadge status="tampered" reason={verification.reason} className={className} />
    );
  }
  return <VerificationBadge status="legacy" className={className} />;
}

/** Shown where the server removed or reordered chat messages (the hash chain breaks at this point). */
export function ChainGapBanner() {
  return (
    <div className="my-1 flex items-center justify-center gap-1.5 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-1.5 text-xs font-medium text-destructive">
      <ShieldAlert className="size-3.5 shrink-0" aria-hidden />
      Messages have been removed or reordered by the server
    </div>
  );
}

/** The verification badge of a user/arbiter chat message (not meant for system messages). */
export function MessageVerificationBadge({ msg }: { msg: VerifiedChatMessage }) {
  const v = msg.verification;
  if (v.status === "verified") return <VerificationBadge status="verified" label="Verified" />;
  if (v.status === "tampered") return <VerificationBadge status="tampered" reason={v.reason} />;
  return <VerificationBadge status="legacy" />;
}
