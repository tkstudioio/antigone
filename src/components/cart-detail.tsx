"use client";

import { useState } from "react";
import Link from "next/link";
import { match } from "ts-pattern";
import { toast } from "react-toastify";
import { ShoppingCart } from "lucide-react";

import { useCart, useRemoveFromCart } from "@/hooks/cart";
import { PLATFORM_FEE_PERCENT } from "@/lib/fees";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { H1, P } from "@/components/ui/typography";
import { CheckoutDialog } from "@/components/checkout-dialog";
import {
  CartProductRow,
  ReservationStatus,
  SummaryLine,
  useCountdown,
} from "@/components/cart-items";

export function CartDetail() {
  const cartQuery = useCart();
  const removeFromCart = useRemoveFromCart();
  const [checkoutOpen, setCheckoutOpen] = useState(false);

  const earliestExpiry = cartQuery.data?.earliestExpiry ?? null;
  const { remaining, isExpired } = useCountdown(earliestExpiry);

  const removingProductId = removeFromCart.isPending ? removeFromCart.variables?.productId : null;

  async function handleRemove(productId: number) {
    try {
      await removeFromCart.mutateAsync({ productId });
      toast.success("Item removed from cart");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error while removing");
    }
  }

  const hasProducts = (cartQuery.data?.products.length ?? 0) > 0;

  return (
    <div className="mx-auto max-w-5xl space-y-8 pb-16">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="space-y-2">
          <span className="font-mono text-xs tracking-widest text-muted-foreground uppercase">
            Buyer
          </span>
          <H1 className="text-3xl">Your cart</H1>
          <P className="max-w-xl text-pretty text-muted-foreground">
            Keys are held for you for 10 minutes while they sit in your cart. Check out before the
            hold runs out.
          </P>
        </div>

        {hasProducts && (
          <div className="flex flex-col gap-2 sm:flex-row-reverse sm:items-center">
            <Button
              className="w-full font-semibold sm:w-auto"
              disabled={isExpired}
              onClick={() => setCheckoutOpen(true)}
            >
              Continue to checkout
            </Button>
            <Button asChild variant="outline" action="muted" className="w-full sm:w-auto">
              <Link href="/products">Browse more</Link>
            </Button>
          </div>
        )}
      </div>

      <section aria-label="Cart" className="space-y-6">
        {match(cartQuery)
          .with({ isPending: true }, () => <CartRowsSkeleton />)
          .with({ isError: true }, () => (
            <p className="text-sm text-destructive">Error loading the cart.</p>
          ))
          .with({ isSuccess: true }, ({ data }) => {
            if (data.products.length === 0) return <EmptyCartState />;

            const subtotal = data.products.reduce((sum, p) => sum + p.totalSubtotal, 0);
            // Estimate only: the exact per-order fee (plus the dust threshold) is computed at checkout.
            const feeEstimate = Math.ceil((subtotal * PLATFORM_FEE_PERCENT) / 100);

            return (
              <>
                {earliestExpiry && <ReservationStatus remaining={remaining} />}

                <Card className="space-y-0 py-0">
                  <ul className="divide-y">
                    {data.products.map((product) => (
                      <li key={product.productId}>
                        <CartProductRow
                          product={product}
                          isRemoving={removingProductId === product.productId}
                          onRemove={() => handleRemove(product.productId)}
                        />
                      </li>
                    ))}
                  </ul>
                </Card>

                <Card className="py-0">
                  <dl className="space-y-2 p-4 text-sm sm:p-5">
                    <SummaryLine label="Items subtotal" amount={subtotal} />
                    <SummaryLine
                      label={`Platform fee (~${PLATFORM_FEE_PERCENT}%, estimate)`}
                      amount={feeEstimate}
                    />
                    <div className="border-t pt-3">
                      <SummaryLine label="Estimated total" amount={subtotal + feeEstimate} strong />
                    </div>
                    <p className="pt-1 text-xs text-muted-foreground">
                      The exact amount for each order is computed at checkout.
                    </p>
                  </dl>
                </Card>
              </>
            );
          })
          .otherwise(() => null)}
      </section>

      <CheckoutDialog open={checkoutOpen} onOpenChange={setCheckoutOpen} />
    </div>
  );
}

function CartRowsSkeleton() {
  return (
    <div className="space-y-6" aria-busy aria-label="Loading cart">
      <Skeleton className="h-16 w-full" />
      <Card className="space-y-0 divide-y py-0">
        {Array.from({ length: 3 }).map((_, index) => (
          <div key={index} className="flex items-center gap-4 p-5">
            <div className="flex-1 space-y-2">
              <Skeleton className="h-5 w-2/5" />
              <Skeleton className="h-5 w-16" />
            </div>
            <Skeleton className="h-5 w-24" />
            <Skeleton className="size-11" />
          </div>
        ))}
      </Card>
    </div>
  );
}

function EmptyCartState() {
  return (
    <div className="flex flex-col items-center gap-4 rounded-md border border-dashed px-6 py-16 text-center">
      <span
        aria-hidden
        className="flex size-10 items-center justify-center rounded-md bg-muted text-muted-foreground [&_svg]:size-5"
      >
        <ShoppingCart />
      </span>
      <div className="space-y-1">
        <p className="font-semibold">Your cart is empty</p>
        <p className="text-sm text-muted-foreground">
          Add keys from the catalog and they are held for you for 10 minutes.
        </p>
      </div>
      <Button asChild>
        <Link href="/products">Browse products</Link>
      </Button>
    </div>
  );
}
