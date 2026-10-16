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
};

export function StocksDetail({ productId, productName }: Props) {
  const tiersQuery = useStockTiers(productId);

  return (
    <div className="flex flex-col gap-6">
      {match(tiersQuery)
        .with({ isPending: true }, () => (
          <div className="flex flex-col gap-6" aria-busy aria-label="Loading tiers">
            {Array.from({ length: 2 }).map((_, i) => (
              <Skeleton key={i} className="h-64 w-full" />
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
              <div className="flex flex-col items-center gap-4 rounded-md border border-dashed px-6 py-16 text-center">
                <span
                  aria-hidden
                  className="flex size-10 items-center justify-center rounded-md bg-muted text-muted-foreground [&_svg]:size-5"
                >
                  <Package />
                </span>
                <p className="font-semibold">No stock for this product</p>
                <Button variant="outline" action="muted" size="sm" asChild>
                  <Link href="/stocks">Back to stocks</Link>
                </Button>
              </div>
            );
          }

          const totalKeys = tiers.reduce((sum, tier) => sum + tier.availableCount, 0);

          return (
            <>
              <p className="text-sm text-muted-foreground">
                {tiers.length.toLocaleString("en-US")} price tier{tiers.length === 1 ? "" : "s"} ·{" "}
                {totalKeys.toLocaleString("en-US")} key{totalKeys === 1 ? "" : "s"} available
              </p>
              {tiers.map((tier) => (
                <StockTierDetail
                  key={tier.price}
                  tier={tier}
                  productId={productId}
                  productName={productName}
                />
              ))}
            </>
          );
        })
        .otherwise(() => null)}
    </div>
  );
}
