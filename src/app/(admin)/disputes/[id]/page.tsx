import { AdminDisputeDetail } from "@/components/admin-dispute-detail";

export default async function AdminDisputeDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const orderId = parseInt(id, 10);

  return <AdminDisputeDetail orderId={isNaN(orderId) ? null : orderId} />;
}
