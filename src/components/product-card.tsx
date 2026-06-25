"use client";

import Link from "next/link";
import { Plus, Star } from "lucide-react";

import type { Product } from "@/hooks/products";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardFooter,
  CardDescription,
} from "@/components/ui/card";
import { InputGroup, InputGroupButton, InputGroupInput } from "./ui/input-group";
import { useAddToCart } from "@/hooks/cart";
import { useState } from "react";
import { toast } from "react-toastify";
import Image from "next/image";
import { toProxySrc } from "./product-image";
import { cn, formatPrice } from "@/lib/utils";
import { Satoshi } from "./icons/satoshi";

export function ProductCard({ product }: { product: Product }) {
  const addToCart = useAddToCart();
  const [quantity, setQuantity] = useState<number>(1);
  const hasStock = product.availableKeysCount > 0;

  return (
    <Card variant={"ghost"}>
      {product.imageUrl && (
        <Image
          src={toProxySrc(product.imageUrl)}
          alt={product.name}
          width={256}
          height={256}
          unoptimized
          className="aspect-video object-cover w-full transition-transform"
        />
      )}
      <CardHeader className="px-0!">
        <CardTitle>{product.name}</CardTitle>
        <CardDescription>
          <Satoshi className="inline size-6" />
          {formatPrice(product.lowestPrice)}
        </CardDescription>
      </CardHeader>
    </Card>
  );

  const header = <CardHeader className="p-0! overflow-hidden rounded-none"></CardHeader>;

  return (
    <Card variant={"ghost"}>
      <div className="aspect-video overflow-hidden">
        {hasStock ? (
          <Link href={`/products/${product.slug}`} className="group">
            {header}
          </Link>
        ) : (
          <div className="cursor-default">{header}</div>
        )}
      </div>
      <CardContent className="px-0! flex gap-md items-center">
        <CardTitle className="line-clamp-2">{product.name}</CardTitle>
        <span className="inline-flex items-center gap-0.5">
          {product.rating &&
            Array.from({ length: 5 }).map((_, i) => (
              <Star
                key={i}
                className={`size-3.5 ${i < product!.rating! ? "fill-amber-400 text-amber-400" : "text-muted-foreground/40"}`}
              />
            ))}
          {product.rating && (
            <span className="ml-1 text-xs text-muted-foreground">
              {product.rating?.toLocaleString("en-US", { maximumFractionDigits: 1 })}
            </span>
          )}
        </span>
      </CardContent>
      <CardFooter
        className={cn("flex justify-between items-end px-0!", {
          invisible: !product.lowestPrice,
          visible: product.lowestPrice,
        })}
      >
        <InputGroup className="w-max">
          <InputGroupInput
            className="h-full"
            placeholder="0"
            type="number"
            step={1}
            value={quantity}
            onChange={(e) => setQuantity(Number(e.target.value))}
            disabled={!product.availableKeysCount}
            min={product.availableKeysCount ? 0 : 1}
            max={product.availableKeysCount}
          />
          <InputGroupButton
            disabled={!product.availableKeysCount}
            onClick={() =>
              addToCart.mutate(
                {
                  productId: product.id,
                  quantity: quantity,
                },
                {
                  onSuccess: () => toast.success(`Added ${quantity} keys to cart`),
                }
              )
            }
          >
            <Plus />
          </InputGroupButton>
        </InputGroup>
      </CardFooter>
    </Card>
  );
}
