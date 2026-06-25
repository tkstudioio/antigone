"use client";

import { match } from "ts-pattern";
import { parseAsInteger, parseAsString, parseAsStringLiteral, useQueryStates } from "nuqs";
import { ChevronRight, PackageSearch } from "lucide-react";
import Link from "next/link";

import { formatPrice } from "@/lib/utils";
import { useAdminDisputes } from "@/hooks/admin";
import { ORDER_STATUS_LABELS, ORDER_STATUS_BADGE } from "@/lib/orders-status";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Card } from "@/components/ui/card";
import { H1 } from "@/components/ui/typography";

export default function AdminDisputePage() {
  const [query, setQuery] = useQueryStates({
    page: parseAsInteger.withDefault(1),
    sort: parseAsStringLiteral(["createdAt", "totalSats", "status"] as const).withDefault(
      "createdAt"
    ),
    dir: parseAsStringLiteral(["asc", "desc"] as const).withDefault("desc"),
    search: parseAsString.withDefault(""),
  });

  const disputesQuery = useAdminDisputes({
    page: query.page,
    sort: query.sort,
    dir: query.dir,
    search: query.search || undefined,
  });

  return (
    <div className="flex flex-col gap-6">
      <H1>Disputes</H1>

      {/* Content */}
      {match(disputesQuery)
        .with({ isPending: true }, () => (
          <div className="flex flex-col gap-2">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-16 w-full" />
            ))}
          </div>
        ))
        .with({ isError: true }, () => (
          <div className="flex flex-col items-center gap-3 py-16 text-destructive">
            <p className="text-sm">Error loading disputes. Try again later.</p>
          </div>
        ))
        .with({ isSuccess: true }, ({ data }) => {
          const { data: rows, total, pageSize } = data;
          const totalPages = Math.ceil(total / pageSize);

          if (rows.length === 0) {
            return (
              <div className="flex flex-col items-center gap-3 py-16 text-muted-foreground">
                <PackageSearch className="size-10 opacity-40" />
                <p className="text-sm">No disputes found.</p>
              </div>
            );
          }

          return (
            <div className="flex flex-col gap-4">
              <div className="flex flex-col gap-2">
                {rows.map((row) => {
                  const statusLabel =
                    ORDER_STATUS_LABELS[row.status as keyof typeof ORDER_STATUS_LABELS] ??
                    row.status;
                  const statusBadge =
                    ORDER_STATUS_BADGE[row.status as keyof typeof ORDER_STATUS_BADGE] ??
                    ({ action: "muted", variant: "outline" } as const);

                  const pendingSettlement =
                    row.status === "concluded" && row.escrowStatus === "disputed";

                  return (
                    <Link key={row.id} href={`/disputes/${row.id}`} className="block">
                      <Card className="space-y-1 px-4 py-3 hover:ring-1 hover:ring-foreground/20">
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-xs text-muted-foreground">#{row.id}</span>
                          <span className="text-sm font-medium">
                            {row.buyerUsername ?? "—"} · {row.sellerUsername ?? "—"}
                          </span>
                          <div className="ml-auto flex shrink-0 items-center gap-2">
                            {pendingSettlement && (
                              <Badge action="primary" variant="outline" className="text-xs">
                                Settlement awaiting
                              </Badge>
                            )}
                            <Badge {...statusBadge}>{statusLabel}</Badge>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                          <span>
                            Buyer: {row.buyerUsername ?? "—"} · Seller: {row.sellerUsername ?? "—"}
                          </span>
                          <div className="ml-auto flex shrink-0 items-center gap-3">
                            <span>{formatPrice(row.totalSats)}</span>
                            <span>{new Date(row.createdAt).toLocaleDateString("en-US")}</span>
                            <ChevronRight className="size-4" />
                          </div>
                        </div>
                      </Card>
                    </Link>
                  );
                })}
              </div>

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
