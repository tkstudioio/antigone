import { notFound } from "next/navigation";

import { OrderDetail } from "@/components/order-detail";

export default async function OrderDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const orderId = parseInt(id, 10);

  if (isNaN(orderId)) {
    notFound();
  }

  return <OrderDetail orderId={orderId} />;
}
