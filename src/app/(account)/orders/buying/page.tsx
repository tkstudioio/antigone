import { OrdersList } from "@/components/orders-list";
import { H1 } from "@/components/ui/typography";

export default function BuyingPage() {
  return (
    <div className="flex flex-col gap-6">
      <H1>My purchases</H1>
      <OrdersList role="buyer" />
    </div>
  );
}
