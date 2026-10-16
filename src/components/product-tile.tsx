import Image from "next/image";
import Link from "next/link";
import { KeyRound, Star } from "lucide-react";

import type { Product } from "@/hooks/products";
import { formatPrice } from "@/lib/utils";
import { Satoshi } from "@/components/icons/satoshi";
import { toProxySrc } from "@/components/product-image";

/** Catalog tile: links to the product detail; out-of-stock products are greyed out and inert. */
export function ProductTile({ product }: { product: Product }) {
  const hasStock = product.availableKeysCount > 0;

  const body = (
    <>
      <div className="flex aspect-video items-center justify-center overflow-hidden rounded-md bg-muted">
        {product.imageUrl ? (
          <Image
            src={toProxySrc(product.imageUrl)}
            alt=""
            width={384}
            height={216}
            unoptimized
            className="size-full object-cover transition-transform duration-300 motion-safe:group-hover:scale-105"
          />
        ) : (
          <KeyRound className="size-8 text-muted-foreground" aria-hidden />
        )}
      </div>
      <div className="flex items-start justify-between gap-4">
        <span className="line-clamp-2 font-medium group-hover:underline">{product.name}</span>
        {hasStock && (
          <span className="flex shrink-0 items-center font-mono text-sm">
            <Satoshi className="size-4" aria-hidden />
            {formatPrice(product.lowestPrice)}
            <span className="sr-only"> sats</span>
          </span>
        )}
      </div>
      <div className="flex items-center justify-between gap-4 text-sm text-muted-foreground">
        <span>
          {hasStock
            ? `${product.availableKeysCount.toLocaleString("en-US")} in stock`
            : "Out of stock"}
        </span>
        {product.rating != null && (
          <span className="flex items-center gap-1 tabular-nums">
            <Star className="size-3.5 fill-amber-400 text-amber-400" aria-hidden />
            {product.rating.toLocaleString("en-US", { maximumFractionDigits: 1 })}
            <span className="sr-only"> out of 5</span>
          </span>
        )}
      </div>
    </>
  );

  if (!hasStock) {
    return <div className="space-y-3 opacity-60 grayscale">{body}</div>;
  }

  return (
    <Link
      href={`/products/${product.slug}`}
      className="group block space-y-3 rounded-md outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
    >
      {body}
    </Link>
  );
}
