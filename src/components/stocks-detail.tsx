"use client";

import Link from "next/link";
import { match } from "ts-pattern";
import { Package } from "lucide-react";

import { useStockTiers } from "@/hooks/stocks";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { StockTierDetail } from "@/components/stock-tier-detail";

type Props = {
  productId: number;
  productName: string;
  productSlug: string;
};

export function StocksDetail({ productId, productName, productSlug }: Props) {
  const tiersQuery = useStockTiers(productId);

  return (
    <div className="flex flex-col gap-4">
      {match(tiersQuery)
        .with({ isPending: true }, () => (
          <div className="flex flex-col gap-3">
            {Array.from({ length: 2 }).map((_, i) => (
              <Skeleton key={i} className="h-32 w-full" />
            ))}
          </div>
        ))
        .with({ isError: true }, () => (
          <p className="text-sm text-destructive">Error loading tiers.</p>
        ))
        .with({ isSuccess: true }, ({ data }) => {
          const tiers = data.tiers;

          if (tiers.length === 0) {
            return (
              <div className="flex flex-col items-center gap-3 py-16 text-muted-foreground">
                <Package className="size-10 opacity-40" />
                <p className="text-sm">No stock for this product.</p>
                <Button variant="outline" size="sm" asChild>
                  <Link href="/stocks">Back to stocks</Link>
                </Button>
              </div>
            );
          }

          return (
            <div className="flex flex-col gap-4">
              {tiers.map((tier) => (
                <StockTierDetail
                  key={tier.price}
                  tier={tier}
                  productId={productId}
                  productName={productName}
                  productSlug={productSlug}
                />
              ))}
            </div>
          );
        })
        .otherwise(() => null)}
    </div>
  );
}
