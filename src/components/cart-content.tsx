"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { match } from "ts-pattern";
import { toast } from "react-toastify";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { useCart, useRemoveFromCart } from "@/hooks/cart";
import { formatPrice } from "@/lib/utils";
import { PLATFORM_FEE_PERCENT } from "@/lib/fees";
import { CheckoutDialog } from "@/components/checkout-dialog";

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

export function CartContent() {
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

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold">Cart</h1>

      {earliestExpiry && (
        <div
          className={`rounded-md px-4 py-2 text-sm font-medium ${
            isExpired ? "bg-destructive/10 text-destructive" : "bg-muted text-muted-foreground"
          }`}
        >
          {isExpired
            ? "Reservation expired — your items are no longer reserved"
            : `Reservation valid for: ${countdown ?? "..."}`}
        </div>
      )}

      {match(cartQuery)
        .with({ isLoading: true }, () => <p className="text-muted-foreground">Loading...</p>)
        .with({ isSuccess: true }, ({ data }) => {
          if (data.products.length === 0) {
            return (
              <div className="flex flex-col items-center gap-4 py-12 text-center">
                <p className="text-muted-foreground">Your cart is empty</p>
                <Button asChild variant="outline">
                  <Link href="/products">Browse products</Link>
                </Button>
              </div>
            );
          }

          const total = data.products.reduce((sum, p) => sum + p.totalSubtotal, 0);
          // 1% platform-fee estimate (the exact, per-order amount is computed at checkout).
          const feeEstimate = Math.ceil((total * PLATFORM_FEE_PERCENT) / 100);

          return (
            <div className="flex flex-col gap-4">
              {data.products.map((p) => (
                <Card key={p.productId}>
                  <CardHeader className="pb-2">
                    <div className="flex items-start justify-between gap-4">
                      <CardTitle className="text-base">{p.productName}</CardTitle>
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={removeFromCart.isPending}
                        onClick={() => handleRemove(p.productId)}
                      >
                        Remove
                      </Button>
                    </div>
                  </CardHeader>
                  <CardContent className="flex flex-col gap-2">
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">
                        {p.totalQuantity.toLocaleString("en-US")} key
                        {p.totalQuantity === 1 ? "" : "s"}
                      </span>
                      <span className="font-semibold">{formatPrice(p.totalSubtotal)}</span>
                    </div>

                    {p.tiers.length > 1 && (
                      <Accordion type="single" collapsible className="w-full">
                        <AccordionItem value="tiers" className="border-none">
                          <AccordionTrigger className="py-1 text-xs text-muted-foreground hover:no-underline">
                            Breakdown per stock
                          </AccordionTrigger>
                          <AccordionContent>
                            <div className="flex flex-col gap-1 pt-1">
                              {p.tiers.map((tier) => (
                                <div
                                  key={`${tier.sellerPubkey}-${tier.price}`}
                                  className="flex items-center justify-between text-xs text-muted-foreground"
                                >
                                  <span>
                                    {tier.quantity}× {formatPrice(tier.price)}{" "}
                                    <span className="text-foreground/50">
                                      ({tier.sellerUsername})
                                    </span>
                                  </span>
                                  <span>{formatPrice(tier.price * tier.quantity)}</span>
                                </div>
                              ))}
                            </div>
                          </AccordionContent>
                        </AccordionItem>
                      </Accordion>
                    )}

                    {p.tiers.length === 1 && (
                      <p className="text-xs text-muted-foreground">
                        Seller: {p.tiers[0].sellerUsername}
                      </p>
                    )}
                  </CardContent>
                </Card>
              ))}

              <div className="flex flex-col gap-1 border-t pt-4">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Items subtotal</span>
                  <span>{formatPrice(total)}</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">
                    Platform fee ({PLATFORM_FEE_PERCENT}%)
                  </span>
                  <span>{formatPrice(feeEstimate)}</span>
                </div>
                <div className="flex items-center justify-between pt-1 font-semibold">
                  <span>Estimated total</span>
                  <span>{formatPrice(total + feeEstimate)}</span>
                </div>
              </div>

              <Button
                className="w-full"
                disabled={isExpired || data.products.length === 0}
                onClick={() => setCheckoutOpen(true)}
              >
                Continue to checkout
              </Button>
            </div>
          );
        })
        .otherwise(() => (
          <p className="text-muted-foreground">Error loading the cart</p>
        ))}

      <CheckoutDialog open={checkoutOpen} onOpenChange={setCheckoutOpen} />
    </div>
  );
}
