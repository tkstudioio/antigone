import "server-only";

/**
 * Anti-abuse limits of the buying flow. Registration is free (keys are generated client-side), so
 * without these an attacker could reserve and check out the whole catalogue and never pay: the
 * reservation cap bounds the cart, the pending-orders cap bounds unpaid checkouts, and the payment
 * TTL releases what was already taken. Defaults are safe; every value is overridable via env.
 */

/** Defensive positive-integer env parse: absent, non-numeric or non-positive values use the fallback. */
export function parsePositiveInt(envVar: string | undefined, fallback: number): number {
  if (!envVar) return fallback;
  const n = Number(envVar);
  if (!Number.isInteger(n) || n <= 0) return fallback;
  return n;
}

/** Max keys a single account may hold reserved (in cart) at once. Override via env. */
export const MAX_RESERVED_KEYS_PER_ACCOUNT = parsePositiveInt(
  process.env.MAX_RESERVED_KEYS_PER_ACCOUNT,
  50
);

/** Max open unpaid (pending, unfunded) orders a single account may hold at once. Override via env. */
export const MAX_PENDING_ORDERS_PER_ACCOUNT = parsePositiveInt(
  process.env.MAX_PENDING_ORDERS_PER_ACCOUNT,
  10
);

/** Minutes a buyer has to pay an order before it expires (`pending` + unfunded escrow). Override via env. */
export const ORDER_PAYMENT_TTL_MINUTES = parsePositiveInt(
  process.env.ORDER_PAYMENT_TTL_MINUTES,
  45
);
