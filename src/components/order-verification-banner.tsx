"use client";

import { TriangleAlert } from "lucide-react";

import type { OrderVerification } from "@/lib/order-verification";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

type Props = {
  verification: OrderVerification;
  /** Opens the arbiter-change warning dialog. */
  onReviewArbiter?: () => void;
};

const STEP_LABELS = [
  ["terms", "Order terms"],
  ["confirm", "Seller confirmation"],
  ["dispute", "Dispute opening"],
  ["verdict", "Arbiter verdict"],
] as const;

/**
 * Order-level trust notice. Shown when something failed verification (possibly tampered by the
 * server: signing and payments are disabled), when the arbiter differs from the pinned one, or when
 * the operator key could not be checked because the Arkade operator is unreachable.
 */
export function OrderVerificationBanner({ verification, onReviewArbiter }: Props) {
  const failures = STEP_LABELS.flatMap(([key, label]) => {
    const step = verification[key];
    return step.status === "tampered" ? [`${label}: ${step.reason}`] : [];
  });

  return (
    <>
      {verification.blocked && (
        <Alert action="negative">
          <TriangleAlert />
          <AlertTitle>⚠ Unverified — possibly tampered by the server</AlertTitle>
          <AlertDescription>
            <p>{verification.blocked}</p>
            {failures.length > 0 && (
              <ul className="mt-2 list-disc pl-4 text-xs">
                {failures.map((failure) => (
                  <li key={failure}>{failure}</li>
                ))}
              </ul>
            )}
            {verification.arbiter?.status === "mismatch" && onReviewArbiter && (
              <Button variant="outline" size="sm" className="mt-3" onClick={onReviewArbiter}>
                Review arbiter change
              </Button>
            )}
          </AlertDescription>
        </Alert>
      )}

      {!verification.blocked && verification.operator === "unavailable" && (
        <Alert action="muted">
          <AlertTitle>Arkade operator unreachable</AlertTitle>
          <AlertDescription>
            The operator key of this escrow could not be checked. Wallet actions will fail until the
            operator is reachable again.
          </AlertDescription>
        </Alert>
      )}
    </>
  );
}
