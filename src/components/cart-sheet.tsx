"use client";

import Link from "next/link";
import { match } from "ts-pattern";
import { toast } from "react-toastify";
import { ShoppingCart } from "lucide-react";

import { useCart, useRemoveFromCart } from "@/hooks/cart";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import {
  CartProductRow,
  ReservationStatus,
  SummaryLine,
  useCountdown,
} from "@/components/cart-items";

/**
 * The storefront header's cart: a trigger with the live item count that opens the cart as a sheet
 * from the right. It is the same reservation as `/cart` (shared rows and countdown from
 * `cart-items.tsx`), minus the checkout itself, which stays on the cart page.
 */
export function CartSheet() {
  const cartQuery = useCart();
  const removeFromCart = useRemoveFromCart();

  const earliestExpiry = cartQuery.data?.earliestExpiry ?? null;
  const { remaining } = useCountdown(earliestExpiry);

  const totalItems = cartQuery.data?.products.reduce((sum, p) => sum + p.totalQuantity, 0) ?? 0;
  const itemsLabel = `${totalItems.toLocaleString("en-US")} ${totalItems === 1 ? "item" : "items"}`;
  const removingProductId = removeFromCart.isPending ? removeFromCart.variables?.productId : null;

  async function handleRemove(productId: number) {
    try {
      await removeFromCart.mutateAsync({ productId });
      toast.success("Item removed from cart");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error while removing");
    }
  }

  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button
          variant="ghost"
          action="muted"
          className="relative min-h-11 min-w-11"
          aria-label={totalItems > 0 ? `Open cart, ${itemsLabel}` : "Open cart"}
        >
          <ShoppingCart className="size-5" aria-hidden />
          {totalItems > 0 && (
            <span
              aria-hidden
              className="absolute -top-0.5 -right-0.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-negative px-1 text-xs font-semibold text-negative-foreground tabular-nums"
            >
              {totalItems > 99 ? "99+" : totalItems}
            </span>
          )}
        </Button>
      </SheetTrigger>
      {/* Announces count changes (e.g. after "Add") as a sentence, not a bare number. */}
      <span className="sr-only" role="status" aria-atomic="true">
        {totalItems > 0 ? `${itemsLabel} in cart` : ""}
      </span>

      <SheetContent
        side="right"
        className="gap-0 p-0 data-[side=right]:w-full data-[side=right]:sm:max-w-md"
      >
        {/* The sheet scrolls as a whole; the column is at least one viewport tall so the footer
            sits at the bottom of a short cart and sticks there on a long one. */}
        <div className="flex min-h-svh flex-col">
          <SheetHeader className="gap-1 border-b p-4 pr-14">
            <SheetTitle className="text-base font-semibold">Your cart</SheetTitle>
            <SheetDescription>
              {totalItems > 0
                ? `${itemsLabel} · held for you for 10 minutes`
                : "Keys you add are held for you for 10 minutes."}
            </SheetDescription>
          </SheetHeader>

          {match(cartQuery)
            .with({ isPending: true }, () => <CartSheetSkeleton />)
            .with({ isError: true }, () => (
              <p className="p-4 text-sm text-destructive">Error loading the cart.</p>
            ))
            .with({ isSuccess: true }, ({ data }) => {
              if (data.products.length === 0) return <EmptyCartSheet />;

              const subtotal = data.products.reduce((sum, p) => sum + p.totalSubtotal, 0);

              return (
                <>
                  <div className="flex-1 space-y-4 p-4">
                    {earliestExpiry && <ReservationStatus remaining={remaining} />}
                    <ul className="divide-y rounded-md border">
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
                  </div>

                  <div className="sticky bottom-0 space-y-3 border-t bg-popover p-4">
                    <dl className="space-y-1 text-sm">
                      <SummaryLine label="Items subtotal" amount={subtotal} strong />
                      <p className="text-xs text-muted-foreground">
                        The platform fee and the exact total are computed at checkout.
                      </p>
                    </dl>
                    <div className="flex flex-col gap-2">
                      <SheetClose asChild>
                        <Button asChild className="min-h-11 w-full font-semibold">
                          <Link href="/cart">Review and check out</Link>
                        </Button>
                      </SheetClose>
                      <SheetClose asChild>
                        <Button variant="outline" action="muted" className="min-h-11 w-full">
                          Continue shopping
                        </Button>
                      </SheetClose>
                    </div>
                  </div>
                </>
              );
            })
            .otherwise(() => null)}
        </div>
      </SheetContent>
    </Sheet>
  );
}

function CartSheetSkeleton() {
  return (
    <div className="space-y-4 p-4" aria-busy aria-label="Loading cart">
      <Skeleton className="h-16 w-full" />
      <div className="divide-y rounded-md border">
        {Array.from({ length: 2 }).map((_, index) => (
          <div key={index} className="flex items-center gap-4 p-4">
            <div className="flex-1 space-y-2">
              <Skeleton className="h-5 w-3/5" />
              <Skeleton className="h-5 w-16" />
            </div>
            <Skeleton className="h-5 w-20" />
          </div>
        ))}
      </div>
    </div>
  );
}

function EmptyCartSheet() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 px-6 py-16 text-center">
      <span
        aria-hidden
        className="flex size-10 items-center justify-center rounded-md bg-muted text-muted-foreground [&_svg]:size-5"
      >
        <ShoppingCart />
      </span>
      <div className="space-y-1">
        <p className="font-semibold">Your cart is empty</p>
        <p className="text-sm text-muted-foreground">
          Pick a seller on a product page to reserve their keys.
        </p>
      </div>
      {/* The catalog lives in this same layout: close the sheet as we navigate. */}
      <SheetClose asChild>
        <Button asChild className="min-h-11">
          <Link href="/products">Browse products</Link>
        </Button>
      </SheetClose>
    </div>
  );
}
