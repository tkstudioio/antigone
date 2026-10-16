"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "react-toastify";
import { Loader2, LogIn, Minus, Plus, ShoppingCart } from "lucide-react";

import type { StockEntry } from "@/lib/backend/query-product-detail";
import { useAddToCart } from "@/hooks/cart";
import { cn, formatPrice } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from "@/components/ui/input-group";
import { Identicon } from "@/components/identicon";
import { Satoshi } from "@/components/icons/satoshi";

/** «All sellers» list: one purchasable row per (seller, price) stock, cheapest first. */
export function ProductSellers({
  stocks,
  viewerPubkey,
}: {
  stocks: StockEntry[];
  viewerPubkey: string | null;
}) {
  return (
    <div className="space-y-4">
      {viewerPubkey == null && (
        <div className="flex flex-col gap-4 rounded-md border border-dashed p-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-muted-foreground">
            Log in with your key to reserve keys and check out.
          </p>
          <Button asChild variant="outline" action="muted" size="sm" className="w-full sm:w-auto">
            <Link href="/login">
              <LogIn />
              Log in
            </Link>
          </Button>
        </div>
      )}
      <Card className="space-y-0 py-0">
        <ul className="divide-y">
          {stocks.map((stock, index) => (
            <li key={`${stock.sellerPubkey}-${stock.price}`}>
              <SellerRow
                stock={stock}
                isBest={index === 0}
                canBuy={viewerPubkey != null}
                isOwn={stock.sellerPubkey === viewerPubkey}
              />
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}

function SellerRow({
  stock,
  isBest,
  canBuy,
  isOwn,
}: {
  stock: StockEntry;
  isBest: boolean;
  canBuy: boolean;
  isOwn: boolean;
}) {
  const router = useRouter();
  const addToCart = useAddToCart();
  const [quantity, setQuantity] = useState(1);
  const max = stock.availableCount;
  const disabled = !canBuy || isOwn || addToCart.isPending;
  const clamp = (value: number) => Math.min(max, Math.max(1, Number.isNaN(value) ? 1 : value));

  function add() {
    addToCart.mutate(
      {
        productId: stock.productId,
        sellerPubkey: stock.sellerPubkey,
        price: stock.price,
        quantity,
      },
      {
        onSuccess: ({ reserved }) => {
          toast.success(
            `${reserved.toLocaleString("en-US")} key${reserved === 1 ? "" : "s"} reserved for 10 minutes`
          );
          setQuantity(1);
          // Availability is rendered on the server: refresh the counts.
          router.refresh();
        },
        onError: (err) => toast.error(err instanceof Error ? err.message : "Could not add to cart"),
      }
    );
  }

  return (
    <div className="flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:p-5">
      <div className="flex min-w-0 flex-1 items-center gap-4">
        <Identicon value={stock.sellerPubkey} size={40} />
        <div className="min-w-0 space-y-1.5">
          <p className="truncate font-semibold">{stock.sellerUsername}</p>
          <div className="flex flex-wrap gap-1.5">
            {isBest && (
              <Badge variant="outline" action="positive" className="text-xs">
                Best price
              </Badge>
            )}
            {isOwn && (
              <Badge variant="outline" action="muted" className="text-xs">
                Your stock
              </Badge>
            )}
          </div>
        </div>
      </div>

      <dl className="grid grid-cols-2 gap-4 text-sm sm:w-56 sm:shrink-0">
        <div className="space-y-1">
          <dt className="text-xs text-muted-foreground">Price per key</dt>
          <dd className="flex items-center font-semibold tabular-nums">
            <Satoshi className="size-4 shrink-0" aria-hidden />
            {formatPrice(stock.price)}
            <span className="sr-only"> sats</span>
          </dd>
        </div>
        <div className="space-y-1">
          <dt className="text-xs text-muted-foreground">Available</dt>
          <dd className="font-semibold tabular-nums">{max.toLocaleString("en-US")}</dd>
        </div>
      </dl>

      <div className="flex gap-2 sm:shrink-0">
        <InputGroup className={cn("w-32", disabled && "opacity-50")}>
          <InputGroupAddon>
            <InputGroupButton
              size="icon-xs"
              aria-label="Decrease quantity"
              disabled={disabled || quantity <= 1}
              onClick={() => setQuantity((q) => clamp(q - 1))}
            >
              <Minus />
            </InputGroupButton>
          </InputGroupAddon>
          <InputGroupInput
            type="number"
            inputMode="numeric"
            min={1}
            max={max}
            value={quantity}
            disabled={disabled}
            aria-label={`Quantity from ${stock.sellerUsername}`}
            className="text-center tabular-nums"
            onChange={(e) => setQuantity(clamp(e.target.valueAsNumber))}
          />
          <InputGroupAddon align="inline-end">
            <InputGroupButton
              size="icon-xs"
              aria-label="Increase quantity"
              disabled={disabled || quantity >= max}
              onClick={() => setQuantity((q) => clamp(q + 1))}
            >
              <Plus />
            </InputGroupButton>
          </InputGroupAddon>
        </InputGroup>
        <Button className="flex-1 font-semibold sm:flex-none" disabled={disabled} onClick={add}>
          {addToCart.isPending ? <Loader2 className="animate-spin" /> : <ShoppingCart />}
          Add
        </Button>
      </div>
    </div>
  );
}
