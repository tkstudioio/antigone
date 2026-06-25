"use client";

import Link from "next/link";
import { ShoppingCart } from "lucide-react";
import { match } from "ts-pattern";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useCart } from "@/hooks/cart";
import { formatPrice } from "@/lib/utils";

export function CartPopover() {
  const cartQuery = useCart();

  const totalItems = cartQuery.data?.products.reduce((sum, p) => sum + p.totalQuantity, 0) ?? 0;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" action={"muted"} className="relative" aria-label="Cart">
          <ShoppingCart className="h-5 w-5" />
          {totalItems > 0 && (
            <Badge
              className="absolute -top-1 -right-1 h-5 w-5 rounded-full p-0 flex items-center justify-center text-xs"
              action="negative"
              variant="solid"
            >
              {totalItems}
            </Badge>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80" align="end">
        <div className="flex flex-col gap-3">
          <p className="font-semibold text-sm">Cart</p>
          {match(cartQuery)
            .with({ isLoading: true }, () => (
              <p className="text-sm text-muted-foreground">Loading...</p>
            ))
            .with({ isSuccess: true }, ({ data }) => {
              if (data.products.length === 0) {
                return <p className="text-sm text-muted-foreground">Your cart is empty</p>;
              }

              const total = data.products.reduce((sum, p) => sum + p.totalSubtotal, 0);

              return (
                <>
                  <div className="flex flex-col gap-2">
                    {data.products.map((p) => (
                      <div key={p.productId} className="flex items-center justify-between text-sm">
                        <div className="flex flex-col">
                          <span className="font-medium">{p.productName}</span>
                          <span className="text-xs text-muted-foreground">
                            {p.totalQuantity.toLocaleString("en-US")} key
                            {p.totalQuantity === 1 ? "" : "s"}
                          </span>
                        </div>
                        <span className="font-medium">{formatPrice(p.totalSubtotal)}</span>
                      </div>
                    ))}
                  </div>
                  <div className="border-t pt-2 flex items-center justify-between text-sm font-semibold">
                    <span>Total</span>
                    <span>{formatPrice(total)}</span>
                  </div>
                  <Button asChild className="w-full" size="sm">
                    <Link href="/cart">Continue</Link>
                  </Button>
                </>
              );
            })
            .otherwise(() => (
              <p className="text-sm text-muted-foreground">Loading error</p>
            ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}
