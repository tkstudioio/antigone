import { requireAdminRoute } from "@/lib/auth/session";
import { PLATFORM_FEE_PERCENT, ADMIN_DISPUTE_SHARE_PERCENT } from "@/lib/fees";

export async function GET() {
  const auth = await requireAdminRoute();
  if (!auth.ok) return auth.response;

  return Response.json({
    platformFeePercent: PLATFORM_FEE_PERCENT,
    adminDisputeSharePercent: ADMIN_DISPUTE_SHARE_PERCENT,
  });
}
