import { timingSafeEqual } from "crypto";
import { sweepExpiredOrders } from "@/lib/backend/mutations-order-expiry";

// Deliberately a GET even though it mutates: Vercel Cron invokes scheduled paths with GET, and a
// GET also keeps this route outside the signed-mutation gate in `src/proxy.ts`. It is NOT a public
// endpoint: it requires `Authorization: Bearer ${CRON_SECRET}` (constant-time comparison).
export const dynamic = "force-dynamic";

function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    console.error("expire-orders: CRON_SECRET is not set, refusing to run");
    return Response.json({ error: "CRON_SECRET is not configured" }, { status: 500 });
  }

  const header = request.headers.get("authorization") ?? "";
  if (!safeEqual(header, `Bearer ${secret}`)) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const result = await sweepExpiredOrders();
  return Response.json(result);
}
