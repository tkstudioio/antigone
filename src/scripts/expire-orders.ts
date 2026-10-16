/**
 * Manual entry point for the unpaid-order sweep (the same job the Vercel cron runs through
 * `GET /api/internal/expire-orders`). Cancels unpaid orders past their payment TTL when the Ark
 * indexer confirms no funds are locked, and promotes the ones that were paid after all.
 *
 *   pnpm orders:expire
 */
import { sweepExpiredOrders } from "@/lib/backend/mutations-order-expiry";

sweepExpiredOrders()
  .then((result) => {
    console.log(JSON.stringify(result, null, 2));
    process.exit(0);
  })
  .catch((err) => {
    console.error("expire-orders failed:", err);
    process.exit(1);
  });
