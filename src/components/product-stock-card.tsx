"use client";
import { Card, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { StockEntry } from "@/lib/backend/query-product-detail";
import { formatPrice } from "@/lib/utils";
import { Satoshi } from "./icons/satoshi";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { useState } from "react";
import { useAddToCart } from "@/hooks/cart";

export function ProductStockCard({ stock }: { stock: StockEntry }) {
  const [quantity, setQuantity] = useState<number>(1);
  const addToCart = useAddToCart();

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-xs">
          <Satoshi />
          {formatPrice(stock?.price)}
        </CardTitle>
        <CardDescription>sold by: {stock.sellerUsername}</CardDescription>
      </CardHeader>
      <CardFooter className="gap-sm">
        <Input
          placeholder="Select quantity"
          type="number"
          value={quantity}
          onChange={({ target }) => setQuantity(target.valueAsNumber)}
          min={1}
          max={stock.availableCount}
        />
        <Button
          onClick={() => {
            addToCart.mutate({
              productId: stock.productId,
              price: stock.price,
              sellerPubkey: stock.sellerPubkey,
              quantity,
            });
          }}
        >
          Add to cart
        </Button>
      </CardFooter>
    </Card>
  );
}
