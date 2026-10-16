"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { match } from "ts-pattern";
import { parseAsInteger, parseAsString, parseAsStringLiteral, useQueryStates } from "nuqs";
import { useDebounceValue } from "usehooks-ts";
import {
  ChevronLeft,
  ChevronRight,
  Boxes,
  Package,
  Search,
  ShoppingBag,
  Store,
  X,
  type LucideIcon,
} from "lucide-react";

import {
  useOrders,
  type OrderListRow,
  type OrderRole,
  type OrderSortColumn,
  type SortDir,
} from "@/hooks/orders";
import { ORDER_STATUS_LABELS, ORDER_STATUS_BADGE, type OrderStatus } from "@/lib/orders-status";
import { formatPrice } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { H1, P } from "@/components/ui/typography";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { Satoshi } from "@/components/icons/satoshi";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from "@/components/ui/input-group";

/**
 * Role-keyed copy and icons for the shared orders list. Lives in this client module because it
 * carries lucide icon components, which cannot cross the server/client boundary. Each role is
 * tuned independently; the component below never branches on the role itself.
 */
export type OrdersListConfig = {
  /** Mono-uppercase label above the title (e.g. "Buyer"). */
  eyebrow: string;
  /** Page `H1`. */
  title: string;
  /** One-line description under the title. */
  description: string;
  /** Optional primary action in the header, right-aligned (full width on mobile). */
  headerAction?: { label: string; href: string; icon: LucideIcon };
  /** Label of the counterparty in each row (e.g. "Seller"). */
  counterpartyLabel: string;
  /** Label and placeholder of the search field (search matches the counterparty username only). */
  searchLabel: string;
  /** Empty-state content shown when the user has no orders at all. */
  empty: {
    icon: LucideIcon;
    title: string;
    description: string;
    ctaLabel: string;
    ctaHref: string;
  };
};

export const ORDERS_LIST_CONFIG: Record<OrderRole, OrdersListConfig> = {
  buyer: {
    eyebrow: "Buyer",
    title: "My purchases",
    description: "Every order you placed, with its status and escrow progress.",
    headerAction: { label: "Browse products", href: "/products", icon: ShoppingBag },
    counterpartyLabel: "Seller",
    searchLabel: "Search seller",
    empty: {
      icon: Package,
      title: "You don't have any purchases yet",
      description: "Orders you place will show up here.",
      ctaLabel: "Browse products",
      ctaHref: "/products",
    },
  },
  seller: {
    eyebrow: "Seller",
    title: "Sales",
    description: "Orders buyers placed on your stock, with their status and escrow progress.",
    headerAction: { label: "Manage stock", href: "/stocks", icon: Boxes },
    counterpartyLabel: "Buyer",
    searchLabel: "Search buyer username",
    empty: {
      icon: Store,
      title: "You don't have any sales yet",
      description:
        "Orders placed on your stock will show up here. Review or add keys to start selling.",
      ctaLabel: "Manage your stock",
      ctaHref: "/stocks",
    },
  },
};

const orderSortOptions: { label: string; sort: OrderSortColumn; dir: SortDir }[] = [
  { label: "Recent", sort: "lastActivity", dir: "desc" },
  { label: "Amount", sort: "totalSats", dir: "desc" },
  { label: "Status", sort: "status", dir: "asc" },
];

const dateFormat = new Intl.DateTimeFormat("en-US", {
  year: "numeric",
  month: "short",
  day: "numeric",
});

export function OrdersList({ role }: { role: OrderRole }) {
  const config = ORDERS_LIST_CONFIG[role];
  const HeaderActionIcon = config.headerAction?.icon;

  const [query, setQuery] = useQueryStates({
    page: parseAsInteger.withDefault(1),
    sort: parseAsStringLiteral([
      "lastActivity",
      "createdAt",
      "totalSats",
      "status",
    ] as const).withDefault("lastActivity"),
    dir: parseAsStringLiteral(["asc", "desc"] as const).withDefault("desc"),
    search: parseAsString.withDefault(""),
  });

  const [inputValue, setInputValue] = useState(query.search);
  const [debouncedInput] = useDebounceValue(inputValue, 350);

  useEffect(() => {
    if (debouncedInput === query.search) return;
    setQuery({ search: debouncedInput, page: 1 });
  }, [debouncedInput]); // eslint-disable-line react-hooks/exhaustive-deps

  const ordersQuery = useOrders({
    role,
    page: query.page,
    sort: query.sort,
    dir: query.dir,
    search: query.search,
  });

  const hasSearch = query.search.length > 0;
  const hasActiveFilters = hasSearch || query.sort !== "lastActivity" || query.dir !== "desc";

  function clearFilters() {
    setInputValue("");
    setQuery({ search: "", sort: "lastActivity", dir: "desc", page: 1 });
  }

  return (
    <div className="mx-auto max-w-5xl space-y-8 pb-16">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="space-y-2">
          <span className="font-mono text-xs tracking-widest text-muted-foreground uppercase">
            {config.eyebrow}
          </span>
          <H1 className="text-3xl">{config.title}</H1>
          <P className="max-w-xl text-pretty text-muted-foreground">{config.description}</P>
        </div>

        {config.headerAction && (
          <Button asChild className="w-full font-semibold sm:w-auto">
            <Link href={config.headerAction.href}>
              {HeaderActionIcon && <HeaderActionIcon aria-hidden />}
              {config.headerAction.label}
            </Link>
          </Button>
        )}
      </div>

      {/* Toolbar */}
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
        <InputGroup className="lg:max-w-sm">
          <InputGroupAddon>
            <Search />
          </InputGroupAddon>
          <InputGroupInput
            placeholder={config.searchLabel}
            aria-label={config.searchLabel}
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
          />
          {(inputValue.length > 0 || hasSearch) && (
            <InputGroupAddon align="inline-end">
              <InputGroupButton
                aria-label="Clear search"
                onClick={() => {
                  setInputValue("");
                  setQuery({ search: "", page: 1 });
                }}
              >
                <X />
              </InputGroupButton>
            </InputGroupAddon>
          )}
        </InputGroup>

        <div className="flex flex-wrap items-center gap-2 lg:ml-auto">
          <SegmentedControl
            aria-label="Sort by"
            className="flex-1 sm:flex-none"
            value={query.sort}
            onValueChange={(sort) => {
              const option = orderSortOptions.find((o) => o.sort === sort);
              if (option) setQuery({ sort: option.sort, dir: option.dir, page: 1 });
            }}
            options={orderSortOptions.map((o) => ({ value: o.sort, label: o.label }))}
          />

          {hasActiveFilters && (
            <Button variant="ghost" action="muted" onClick={clearFilters}>
              <X />
              Clear
            </Button>
          )}
        </div>
      </div>

      <section aria-label="Orders" className="space-y-4">
        {match(ordersQuery)
          .with({ isPending: true }, () => <OrderRowsSkeleton />)
          .with({ isError: true }, () => (
            <p className="text-sm text-destructive">Error loading orders.</p>
          ))
          .with({ isSuccess: true }, ({ data }) => {
            const { data: rows, total, pageSize } = data;
            const totalPages = Math.max(1, Math.ceil(total / pageSize));

            if (rows.length === 0) {
              return <EmptyOrdersState config={config} hasSearch={hasSearch} />;
            }

            return (
              <>
                <p className="text-sm text-muted-foreground">
                  {total.toLocaleString("en-US")} order{total === 1 ? "" : "s"}
                </p>

                <Card className="space-y-0 py-0">
                  <ul className="divide-y">
                    {rows.map((row) => (
                      <li key={row.id}>
                        <OrderRow row={row} counterpartyLabel={config.counterpartyLabel} />
                      </li>
                    ))}
                  </ul>
                </Card>

                {totalPages > 1 && (
                  <nav
                    aria-label="Pagination"
                    className="flex items-center justify-between gap-4 sm:justify-end"
                  >
                    <Button
                      variant="outline"
                      action="muted"
                      size="sm"
                      disabled={query.page <= 1}
                      onClick={() => setQuery({ page: query.page - 1 })}
                    >
                      <ChevronLeft />
                      Previous
                    </Button>
                    <span className="text-sm text-muted-foreground tabular-nums">
                      Page {query.page.toLocaleString("en-US")} of{" "}
                      {totalPages.toLocaleString("en-US")}
                    </span>
                    <Button
                      variant="outline"
                      action="muted"
                      size="sm"
                      disabled={query.page >= totalPages}
                      onClick={() => setQuery({ page: query.page + 1 })}
                    >
                      Next
                      <ChevronRight />
                    </Button>
                  </nav>
                )}
              </>
            );
          })
          .otherwise(() => null)}
      </section>
    </div>
  );
}

function OrderRow({ row, counterpartyLabel }: { row: OrderListRow; counterpartyLabel: string }) {
  const { firstProductName, itemCount } = row.productSummary;
  const extraItems = itemCount - 1;
  const statusLabel = ORDER_STATUS_LABELS[row.status as OrderStatus] ?? row.status;
  const statusBadge = ORDER_STATUS_BADGE[row.status as OrderStatus] ?? {
    action: "muted" as const,
    variant: "outline" as const,
  };
  const activity = new Date(row.lastActivityAt);

  return (
    <Link
      href={`/orders/${row.id}`}
      className="group flex flex-col gap-4 p-4 outline-none transition-colors hover:bg-muted/50 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:ring-inset lg:flex-row lg:items-center sm:p-5"
    >
      <div className="min-w-0 flex-1 space-y-1.5">
        <div className="flex min-w-0 items-center gap-2">
          <span className="shrink-0 font-mono text-xs text-muted-foreground">#{row.id}</span>
          <p className="truncate font-semibold group-hover:underline">{firstProductName ?? "—"}</p>
          {extraItems > 0 && (
            <Badge action="muted" variant="solid" className="shrink-0 px-1.5 py-0 text-xs">
              <span aria-hidden>+{extraItems.toLocaleString("en-US")}</span>
              <span className="sr-only">
                and {extraItems.toLocaleString("en-US")} more item{extraItems === 1 ? "" : "s"}
              </span>
            </Badge>
          )}
        </div>
        <p className="truncate text-sm text-muted-foreground">
          {counterpartyLabel}: {row.counterpartyUsername || "—"}
        </p>
      </div>

      <dl className="grid grid-cols-2 items-center gap-4 text-sm lg:w-80 lg:shrink-0">
        <div className="space-y-1.5">
          <dt className="text-xs text-muted-foreground">Total</dt>
          <dd className="flex items-center font-semibold tabular-nums">
            <Satoshi className="size-4 shrink-0" aria-hidden />
            {formatPrice(row.totalSats)}
            <span className="sr-only"> sats</span>
          </dd>
        </div>
        <div className="space-y-1.5">
          <dt className="text-xs text-muted-foreground">Last activity</dt>
          <dd className="font-semibold tabular-nums">
            <time dateTime={activity.toISOString()} title={activity.toLocaleString("en-US")}>
              {dateFormat.format(activity)}
            </time>
          </dd>
        </div>
      </dl>

      <div className="flex items-center gap-3 lg:w-32 lg:shrink-0 lg:justify-end">
        <Badge {...statusBadge} className="shrink-0">
          {statusLabel}
        </Badge>
        <ChevronRight
          className="hidden size-4 shrink-0 text-muted-foreground transition-transform motion-safe:group-hover:translate-x-0.5 sm:block"
          aria-hidden
        />
      </div>
    </Link>
  );
}

function OrderRowsSkeleton() {
  return (
    <Card className="space-y-0 divide-y py-0" aria-busy aria-label="Loading orders">
      {Array.from({ length: 5 }).map((_, index) => (
        <div key={index} className="flex flex-col gap-4 p-4 lg:flex-row lg:items-center sm:p-5">
          <div className="flex-1 space-y-2">
            <Skeleton className="h-5 w-2/5" />
            <Skeleton className="h-4 w-1/4" />
          </div>
          <Skeleton className="h-10 lg:w-80" />
          <Skeleton className="h-6 lg:w-32" />
        </div>
      ))}
    </Card>
  );
}

function EmptyOrdersState({ config, hasSearch }: { config: OrdersListConfig; hasSearch: boolean }) {
  const Icon = config.empty.icon;

  return (
    <div className="flex flex-col items-center gap-4 rounded-md border border-dashed px-6 py-16 text-center">
      <span
        aria-hidden
        className="flex size-10 items-center justify-center rounded-md bg-muted text-muted-foreground [&_svg]:size-5"
      >
        <Icon />
      </span>
      <div className="space-y-1">
        <p className="font-semibold">{hasSearch ? "No orders found" : config.empty.title}</p>
        <p className="text-sm text-muted-foreground">
          {hasSearch
            ? `No ${config.counterpartyLabel.toLowerCase()} username matches your search.`
            : config.empty.description}
        </p>
      </div>
      {!hasSearch && (
        <Button asChild>
          <Link href={config.empty.ctaHref}>{config.empty.ctaLabel}</Link>
        </Button>
      )}
    </div>
  );
}
