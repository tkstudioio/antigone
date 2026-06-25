import { OrdersList } from "@/components/orders-list";
import { H1 } from "@/components/ui/typography";

export default function SellingPage() {
  return (
    <div className="flex flex-col gap-6">
      <H1>My sales</H1>
      <OrdersList role="seller" />
    </div>
  );
}
