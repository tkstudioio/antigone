"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { match } from "ts-pattern";
import { toast } from "react-toastify";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";

import { useCart, useRemoveFromCart } from "@/hooks/cart";
import { formatPrice } from "@/lib/utils";
import { CheckoutDialog } from "@/components/checkout-dialog";
import { Large } from "@/components/ui/typography";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Trash } from "lucide-react";
import { Separator } from "@/components/ui/separator";

function computeCountdown(targetIso: string): string {
  const diff = new Date(targetIso).getTime() - Date.now();
  if (diff <= 0) return "00:00";
  const totalSeconds = Math.floor(diff / 1000);
  const minutes = Math.floor(totalSeconds / 60)
    .toString()
    .padStart(2, "0");
  const seconds = (totalSeconds % 60).toString().padStart(2, "0");
  return `${minutes}:${seconds}`;
}

function useCountdown(targetIso: string | null): { display: string | null; isExpired: boolean } {
  const [display, setDisplay] = useState<string | null>(null);

  useEffect(() => {
    if (!targetIso) return;
    const firstTick = setTimeout(() => setDisplay(computeCountdown(targetIso)), 0);
    const interval = setInterval(() => setDisplay(computeCountdown(targetIso)), 1000);
    return () => {
      clearTimeout(firstTick);
      clearInterval(interval);
    };
  }, [targetIso]);

  return { display, isExpired: display === "00:00" };
}

export default function CartPage() {
  const cartQuery = useCart();
  const removeFromCart = useRemoveFromCart();

  const [checkoutOpen, setCheckoutOpen] = useState(false);

  const earliestExpiry = cartQuery.data?.earliestExpiry ?? null;
  const { display: countdown, isExpired } = useCountdown(earliestExpiry);

  async function handleRemove(productId: number) {
    try {
      await removeFromCart.mutateAsync({ productId });
      toast.success("Item removed from cart");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error while removing");
    }
  }

  return match(cartQuery)
    .with({ isSuccess: true, data: { products: [] } }, () => <Large>Cart is empty</Large>)
    .with({ isSuccess: true }, ({ data }) => (
      <>
        <CheckoutDialog open={checkoutOpen} onOpenChange={setCheckoutOpen} />
        <Large>Your cart</Large>
        <Alert action={isExpired ? "negative" : "positive"}>
          <AlertDescription>
            {isExpired ? "Reservation expired" : `Reservation countdown: ${countdown ?? "..."}`}
          </AlertDescription>
        </Alert>
        {data.products.map((product) => (
          <Card key={product.productId}>
            <CardHeader className="pb-2">
              <div className="flex items-start justify-between gap-4">
                <CardTitle className="text-base">{product.productName}</CardTitle>
                <Button
                  variant="ghost"
                  action="negative"
                  size="sm"
                  disabled={removeFromCart.isPending}
                  onClick={() => handleRemove(product.productId)}
                >
                  <Trash />
                </Button>
              </div>
            </CardHeader>
            <CardContent className="flex flex-col gap-2">
              <div className="flex flex-col gap-1 pt-1">
                {product.tiers.map((tier) => (
                  <div
                    key={`${tier.sellerPubkey}-${tier.price}`}
                    className="flex items-center justify-between text-xs text-muted-foreground"
                  >
                    <span>
                      {tier.quantity}× {formatPrice(tier.price)}{" "}
                      <span className="text-foreground/50">({tier.sellerUsername})</span>
                    </span>
                    <span>{formatPrice(tier.price * tier.quantity)}</span>
                  </div>
                ))}
              </div>
              <Separator />
            </CardContent>
            <CardFooter>
              <div className="flex items-center justify-between w-full">
                <span className="text-muted-foreground">
                  {product.totalQuantity.toLocaleString("en-US")} key
                  {product.totalQuantity === 1 ? null : "s"}
                </span>
                <span className="font-semibold">{formatPrice(product.totalSubtotal)}</span>
              </div>
            </CardFooter>
          </Card>
        ))}

        <Button
          className="w-full"
          disabled={isExpired || data.products.length === 0}
          onClick={() => setCheckoutOpen(true)}
        >
          Continue to checkout
        </Button>
        <Button className="w-full" variant={"ghost"}>
          <Link href="/products">Browse more</Link>
        </Button>
      </>
    ))
    .otherwise(() => null);
}
