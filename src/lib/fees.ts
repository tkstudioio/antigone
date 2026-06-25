function parsePercent(envVar: string | undefined, fallback: number = 0): number {
  if (!envVar) return fallback;
  const n = parseFloat(envVar);
  if (isNaN(n) || n < 0 || n > 100) return fallback;
  return n;
}

// Platform fee defaults to 1%: every order carries a 1% surcharge paid by the buyer on top of the
// goods price (the buyer funds `goods + fee`, the seller nets the full goods price, the admin keeps
// the fee). Override via PLATFORM_FEE_PERCENT.
export const PLATFORM_FEE_PERCENT = parsePercent(process.env.PLATFORM_FEE_PERCENT, 1);
export const ADMIN_DISPUTE_SHARE_PERCENT = parsePercent(process.env.ADMIN_DISPUTE_SHARE_PERCENT);

/**
 * Platform fee (sats) charged on an order. The buyer pays this on top of the goods price.
 *
 * The fee is the operator's dust threshold PLUS the percentage of the goods total:
 * `dustLimit + ceil(totalSats * PLATFORM_FEE_PERCENT / 100)`. The fee becomes its own output (to the
 * admin) in the release/dispute settlement tx, so the `dustLimit` base guarantees the output clears
 * the operator's dust threshold while the platform still nets its full percentage on top. For the
 * smallest order (percentage = 1 sat) this yields `dustLimit + 1` — the configured minimum.
 * `dustLimit` is the operator's `getInfo().dust`; omit it (defaults to 0) only for display estimates,
 * where the client cannot know the operator's dust.
 */
export function calculatePlatformFee(totalSats: number, dustLimit: number = 0): number {
  if (PLATFORM_FEE_PERCENT <= 0) return 0;
  const pct = Math.ceil((totalSats * PLATFORM_FEE_PERCENT) / 100);
  return dustLimit + pct;
}

export function calculateAdminDisputeShare(totalSats: number): number {
  if (ADMIN_DISPUTE_SHARE_PERCENT <= 0) return 0;
  return Math.ceil((totalSats * ADMIN_DISPUTE_SHARE_PERCENT) / 100);
}

export function computeDisputeBreakdown(params: {
  /** Goods total (sum of key prices); does NOT include the platform fee surcharge. */
  totalSats: number;
  refundAmount: number;
  platformFee: number;
  adminDisputeShare: number;
  /**
   * Total sats actually locked in the escrow (sum of its spendable VTXOs). Defaults to the expected
   * `totalSats + platformFee` (the buyer funds the goods price plus the 1% surcharge). Arkade requires
   * `sum(inputs) == sum(outputs)` for an offchain tx (fee = 0); since the settlement spends ALL the
   * escrow's VTXOs, any overfunding beyond the expected amount (`lockedTotal - (totalSats +
   * platformFee)`) must be accounted for in the outputs — it is returned to the buyer. Without this
   * the settlement tx would have `inputs > outputs` and the operator would reject it.
   */
  lockedTotal?: number;
}): {
  buyerReceives: number;
  adminReceives: number;
  sellerReceives: number;
} | null {
  const { totalSats, refundAmount, platformFee, adminDisputeShare } = params;
  // The buyer paid the goods price plus the platform-fee surcharge on top.
  const expectedLocked = totalSats + platformFee;
  const lockedTotal = params.lockedTotal ?? expectedLocked;
  // The platform fee is non-refundable (the cost of the escrow service) and the admin also keeps the
  // arbitration share; neither is docked from the seller, who paid neither.
  const adminReceives = platformFee + adminDisputeShare;
  // The goods pot (totalSats) is split between the buyer refund and the seller, net of arbitration.
  const sellerReceives = totalSats - adminDisputeShare - refundAmount;
  if (sellerReceives < 0) return null;
  // Overfunding (beyond goods + fee) goes back to the buyer so the outputs sum to the locked total.
  const surplus = Math.max(0, lockedTotal - expectedLocked);
  return { buyerReceives: refundAmount + surplus, adminReceives, sellerReceives };
}
