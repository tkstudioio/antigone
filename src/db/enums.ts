export const chatStatusValues = ["open", "closed"] as const;
export type ChatStatus = (typeof chatStatusValues)[number];

export const orderStatusValues = [
  "pending",
  "funded",
  "completed",
  "disputed",
  "refunded",
  "cancelled",
  "concluded",
] as const;
export type OrderStatus = (typeof orderStatusValues)[number];

export const conclusionStatusValues = ["completed", "partially_refunded", "cancelled"] as const;
export type ConclusionStatus = (typeof conclusionStatusValues)[number];

export const escrowStatusValues = [
  "awaitingFunds",
  "partiallyFunded",
  "fundLocked",
  "sellerReady",
  "buyerSubmitted",
  "buyerCheckpointsSigned",
  "completed",
  "disputed",
  // The favoured party prepared the settlement (signed ark tx persisted); the arbiter has not
  // co-signed yet. Funds are still unspent, so the verdict is still overridable.
  "settlementPrepared",
  // The arbiter co-signed and submitted to the operator; the favoured party still has to finalize.
  "settling",
  "refunded",
  // Funds were locked but the escrow's VTXOs expired and were swept by the operator (batch expiry)
  // before release/settlement. Terminal: the locked funds are no longer enforceable on-chain.
  "expiredSwept",
] as const;
export type EscrowStatus = (typeof escrowStatusValues)[number];

export const reviewerRoleValues = ["seller", "buyer"] as const;
export type ReviewerRole = (typeof reviewerRoleValues)[number];
