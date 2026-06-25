"use client";

import Link from "next/link";
import { match } from "ts-pattern";
import { parseAsInteger, useQueryStates } from "nuqs";
import { ChevronRight, Package, Store, type LucideIcon } from "lucide-react";

import { useOrders, type OrderRole } from "@/hooks/orders";
import { ORDER_STATUS_LABELS, ORDER_STATUS_BADGE, type OrderStatus } from "@/lib/orders-status";
import { formatPrice } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { H1 } from "@/components/ui/typography";

const EMPTY_STATE: Record<
  OrderRole,
  { title: string; cta: string; href: string; icon: LucideIcon; counterpartyLabel: string }
> = {
  buyer: {
    title: "You don't have any purchases yet",
    cta: "Browse products",
    href: "/products",
    icon: Package,
    counterpartyLabel: "Seller",
  },
  seller: {
    title: "You don't have any sales yet",
    cta: "Manage your stocks",
    href: "/stocks",
    icon: Store,
    counterpartyLabel: "Buyer",
  },
};

export function OrdersList({ role }: { role: OrderRole }) {
  const [query, setQuery] = useQueryStates({
    page: parseAsInteger.withDefault(1),
  });

  const ordersQuery = useOrders({ role, page: query.page });
  const config = EMPTY_STATE[role];

  return (
    <div className="flex flex-col gap-6">
      {match(ordersQuery)
        .with({ isPending: true }, () => (
          <div className="flex flex-col gap-2">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-16 w-full" />
            ))}
          </div>
        ))
        .with({ isError: true }, () => (
          <p className="text-sm text-destructive">Error loading orders.</p>
        ))
        .with({ isSuccess: true }, ({ data }) => {
          const { data: rows, total, pageSize } = data;
          const totalPages = Math.ceil(total / pageSize);

          if (rows.length === 0) {
            const Icon = config.icon;
            return (
              <div className="flex flex-col items-center gap-4 py-12 text-center">
                <Icon className="size-32" strokeWidth={0.5} />
                <H1>{config.title}</H1>
                <Button size="lg" className="w-full" asChild>
                  <Link href={config.href}>{config.cta}</Link>
                </Button>
              </div>
            );
          }

          return (
            <div className="flex flex-col gap-3">
              {rows.map((row) => {
                const { firstProductName, itemCount } = row.productSummary;
                const statusLabel = ORDER_STATUS_LABELS[row.status as OrderStatus] ?? row.status;
                const statusBadge = ORDER_STATUS_BADGE[row.status as OrderStatus] ?? {
                  action: "muted" as const,
                  variant: "outline" as const,
                };

                return (
                  <Link key={row.id} href={`/orders/${row.id}`} className="block">
                    <Card className="space-y-1 px-md py-3 hover:ring-foreground/20">
                      {/* Row 1: id + product + status */}
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-xs text-muted-foreground">#{row.id}</span>
                        <span className="truncate font-medium">{firstProductName ?? "—"}</span>
                        {itemCount > 1 && (
                          <Badge action="muted" variant="solid" className="px-1.5 py-0 text-xs">
                            +{itemCount - 1}
                          </Badge>
                        )}
                        <Badge {...statusBadge} className="ml-auto shrink-0">
                          {statusLabel}
                        </Badge>
                      </div>

                      {/* Row 2: counterparty + total + date */}
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <span className="truncate">
                          {config.counterpartyLabel}: {row.counterpartyUsername}
                        </span>
                        <span className="ml-auto flex shrink-0 items-center gap-3">
                          <span className="font-medium text-foreground">
                            {formatPrice(row.totalSats)} sats
                          </span>
                          <span>{new Date(row.lastActivityAt).toLocaleDateString("en-US")}</span>
                          <ChevronRight className="size-4" />
                        </span>
                      </div>
                    </Card>
                  </Link>
                );
              })}

              {/* Pagination */}
              {totalPages > 1 && (
                <div className="flex items-center justify-end gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={query.page <= 1}
                    onClick={() => setQuery({ page: query.page - 1 })}
                  >
                    Previous
                  </Button>
                  <span className="text-sm text-muted-foreground">
                    {query.page} / {totalPages}
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={query.page >= totalPages}
                    onClick={() => setQuery({ page: query.page + 1 })}
                  >
                    Next
                  </Button>
                </div>
              )}
            </div>
          );
        })
        .otherwise(() => null)}
    </div>
  );
}
