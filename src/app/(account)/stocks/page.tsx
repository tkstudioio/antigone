"use client";

import { useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { match } from "ts-pattern";
import { parseAsInteger, parseAsString, parseAsStringLiteral, useQueryStates } from "nuqs";
import { useDebounceValue } from "usehooks-ts";
import {
  Boxes,
  ChevronLeft,
  ChevronRight,
  Layers,
  PackageCheck,
  Plus,
  Search,
  SlidersHorizontal,
  X,
} from "lucide-react";

import type { SortDir, StockProduct, StockSortColumn } from "@/hooks/stocks";
import { useStockProducts } from "@/hooks/stocks";
import { cn, formatPrice } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Skeleton } from "@/components/ui/skeleton";
import { H1, P } from "@/components/ui/typography";
import { Card } from "@/components/ui/card";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { Satoshi } from "@/components/icons/satoshi";
import { CreateStockDialog } from "@/components/create-stock-dialog";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from "@/components/ui/input-group";

const stockSortOptions: { label: string; sort: StockSortColumn; dir: SortDir }[] = [
  { label: "Name", sort: "name", dir: "asc" },
  { label: "Available", sort: "availableKeysCount", dir: "desc" },
  { label: "Price", sort: "lowestPrice", dir: "asc" },
];

const PRICE_FILTER_MAX = 10_000_000;
const KEYS_FILTER_MAX = 1_000;

export default function StocksPage() {
  const [sheetOpen, setSheetOpen] = useState(false);
  const [priceRange, setPriceRange] = useState<[number, number]>([0, PRICE_FILTER_MAX]);
  const [keysRange, setKeysRange] = useState<[number, number]>([0, KEYS_FILTER_MAX]);

  const [query, setQuery] = useQueryStates({
    page: parseAsInteger.withDefault(1),
    sort: parseAsStringLiteral(["name", "availableKeysCount", "lowestPrice"] as const).withDefault(
      "name"
    ),
    dir: parseAsStringLiteral(["asc", "desc"] as const).withDefault("asc"),
    search: parseAsString.withDefault(""),
  });

  const [inputValue, setInputValue] = useState(query.search);
  const [debouncedInput] = useDebounceValue(inputValue, 350);

  useEffect(() => {
    if (debouncedInput === query.search) return;
    setQuery({ search: debouncedInput, page: 1 });
  }, [debouncedInput]); // eslint-disable-line react-hooks/exhaustive-deps

  const stocksQuery = useStockProducts({
    page: query.page,
    search: query.search,
    sort: query.sort,
    dir: query.dir,
  });

  const hasRangeFilters =
    priceRange[0] !== 0 ||
    priceRange[1] !== PRICE_FILTER_MAX ||
    keysRange[0] !== 0 ||
    keysRange[1] !== KEYS_FILTER_MAX;
  const hasActiveFilters =
    query.search.length > 0 || hasRangeFilters || query.sort !== "name" || query.dir !== "asc";

  function clearFilters() {
    setInputValue("");
    setPriceRange([0, PRICE_FILTER_MAX]);
    setKeysRange([0, KEYS_FILTER_MAX]);
    setQuery({ search: "", sort: "name", dir: "asc", page: 1 });
  }

  return (
    <div className="mx-auto max-w-5xl space-y-8 pb-16">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="space-y-2">
          <span className="font-mono text-xs tracking-widest text-muted-foreground uppercase">
            Seller
          </span>
          <H1 className="text-3xl">Your stocks</H1>
          <P className="max-w-xl text-pretty text-muted-foreground">
            The license keys you sell, grouped by product. Codes are encrypted in your browser
            before they are uploaded.
          </P>
        </div>

        <Button onClick={() => setSheetOpen(true)} className="w-full font-semibold sm:w-auto">
          <Plus />
          Add stock
        </Button>

        <CreateStockDialog open={sheetOpen} onOpenChange={setSheetOpen} mode="create" />
      </div>

      {/* Toolbar */}
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
        <InputGroup className="lg:max-w-sm">
          <InputGroupAddon>
            <Search />
          </InputGroupAddon>
          <InputGroupInput
            placeholder="Search product"
            aria-label="Search product"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
          />
          {(inputValue.length > 0 || query.search.length > 0) && (
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
              const option = stockSortOptions.find((o) => o.sort === sort);
              if (option) setQuery({ sort: option.sort, dir: option.dir, page: 1 });
            }}
            options={stockSortOptions.map((o) => ({ value: o.sort, label: o.label }))}
          />

          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" action="muted">
                <SlidersHorizontal />
                Filters
                {hasRangeFilters && (
                  <>
                    <span className="size-2 rounded-full bg-positive" aria-hidden />
                    <span className="sr-only">(active)</span>
                  </>
                )}
              </Button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-80 space-y-6">
              <FilterSection
                label="Lowest price"
                value={`${formatPrice(priceRange[0])} – ${formatPrice(priceRange[1])} sats`}
              >
                <Slider
                  min={0}
                  max={PRICE_FILTER_MAX}
                  step={50_000}
                  value={priceRange}
                  aria-label="Lowest price range"
                  onValueChange={(value) =>
                    setPriceRange([value[0] ?? 0, value[1] ?? PRICE_FILTER_MAX])
                  }
                />
              </FilterSection>
              <FilterSection
                label="Available keys"
                value={`${keysRange[0].toLocaleString("en-US")} – ${keysRange[1].toLocaleString("en-US")}`}
              >
                <Slider
                  min={0}
                  max={KEYS_FILTER_MAX}
                  step={1}
                  value={keysRange}
                  aria-label="Available keys range"
                  onValueChange={(value) =>
                    setKeysRange([value[0] ?? 0, value[1] ?? KEYS_FILTER_MAX])
                  }
                />
              </FilterSection>
              <p className="text-xs text-muted-foreground">
                Ranges filter the products on the current page.
              </p>
            </PopoverContent>
          </Popover>

          {hasActiveFilters && (
            <Button variant="ghost" action="muted" onClick={clearFilters}>
              <X />
              Clear
            </Button>
          )}
        </div>
      </div>

      <section aria-label="Stocks" className="space-y-4">
        {match(stocksQuery)
          .with({ isPending: true }, () => <StockRowsSkeleton />)
          .with({ isError: true }, () => (
            <p className="text-sm text-destructive">Error loading stocks.</p>
          ))
          .with({ isSuccess: true }, ({ data }) => {
            const { data: rows, total, pageSize } = data;
            const filteredRows = rows.filter(
              (row) =>
                row.lowestPrice >= priceRange[0] &&
                row.lowestPrice <= priceRange[1] &&
                row.availableKeysCount >= keysRange[0] &&
                row.availableKeysCount <= keysRange[1]
            );
            const totalPages = Math.max(1, Math.ceil(total / pageSize));
            const visibleTotal = hasRangeFilters ? filteredRows.length : total;

            if (filteredRows.length === 0) {
              return (
                <EmptyStocksState
                  hasSearch={query.search.length > 0 || hasRangeFilters}
                  onCreate={() => setSheetOpen(true)}
                />
              );
            }

            return (
              <>
                <p className="text-sm text-muted-foreground">
                  {visibleTotal.toLocaleString("en-US")} product{visibleTotal === 1 ? "" : "s"}
                </p>

                <Card className="space-y-0 py-0">
                  <ul className="divide-y">
                    {filteredRows.map((row) => (
                      <li key={row.productId}>
                        <StockProductRow stock={row} />
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

function FilterSection({
  label,
  value,
  children,
}: {
  label: string;
  value?: string;
  children: ReactNode;
}) {
  return (
    <div className="space-y-3">
      <div className="flex min-w-0 items-center justify-between gap-2">
        <p className="shrink-0 text-sm font-medium">{label}</p>
        {value ? (
          <span className="min-w-0 truncate text-right font-mono text-xs text-muted-foreground">
            {value}
          </span>
        ) : null}
      </div>
      {children}
    </div>
  );
}

function StockProductRow({ stock }: { stock: StockProduct }) {
  const availability = getAvailability(stock.availableKeysCount);
  const hasPriceRange = stock.highestPrice > stock.lowestPrice;

  return (
    <Link
      href={`/stocks/${stock.slug}`}
      className="group flex flex-col gap-4 p-4 outline-none transition-colors hover:bg-muted/50 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:ring-inset sm:flex-row sm:items-center sm:p-5"
    >
      <div className="flex min-w-0 flex-1 items-center gap-4">
        <span
          aria-hidden
          className="flex size-10 shrink-0 items-center justify-center rounded-md bg-primary text-primary-foreground [&_svg]:size-5"
        >
          <Boxes />
        </span>
        <div className="min-w-0 space-y-1.5">
          <p className="truncate font-semibold group-hover:underline">{stock.name}</p>
          <div className="flex flex-wrap gap-1.5">
            {stock.archived && (
              <Badge variant="outline" action="negative" className="text-xs">
                Archived · not on sale
              </Badge>
            )}
            <Badge variant="outline" action="muted" className="items-center gap-1 text-xs">
              <Layers className="size-3" aria-hidden />
              {stock.priceTiers.toLocaleString("en-US")} {stock.priceTiers === 1 ? "tier" : "tiers"}
            </Badge>
            <Badge
              variant="outline"
              action="muted"
              className={cn("text-xs", availability.badgeClassName)}
            >
              {availability.label}
            </Badge>
          </div>
        </div>
      </div>

      <dl className="grid grid-cols-2 gap-4 text-sm sm:w-80 sm:shrink-0">
        <div className="space-y-1.5">
          <dt className="text-xs text-muted-foreground">Available</dt>
          <dd className="font-semibold tabular-nums">
            {stock.availableKeysCount.toLocaleString("en-US")} key
            {stock.availableKeysCount === 1 ? "" : "s"}
          </dd>
          <dd className="grid w-24 grid-cols-5 gap-1" aria-hidden>
            {Array.from({ length: 5 }).map((_, index) => (
              <span
                key={index}
                className={cn(
                  "h-1 rounded-full",
                  index < availability.blocks ? availability.barClassName : "bg-foreground/10"
                )}
              />
            ))}
          </dd>
        </div>
        <div className="space-y-1.5">
          <dt className="text-xs text-muted-foreground">
            {hasPriceRange ? "Price range" : "Price"}
          </dt>
          <dd className="flex items-center font-semibold tabular-nums">
            <Satoshi className="size-4 shrink-0" aria-hidden />
            {formatPrice(stock.lowestPrice)}
            {hasPriceRange && ` – ${formatPrice(stock.highestPrice)}`}
            <span className="sr-only"> sats</span>
          </dd>
        </div>
      </dl>

      <ChevronRight
        className="hidden size-4 shrink-0 text-muted-foreground transition-transform motion-safe:group-hover:translate-x-0.5 sm:block"
        aria-hidden
      />
    </Link>
  );
}

function StockRowsSkeleton() {
  return (
    <Card className="space-y-0 divide-y py-0" aria-busy aria-label="Loading stocks">
      {Array.from({ length: 4 }).map((_, index) => (
        <div key={index} className="flex items-center gap-4 p-5">
          <Skeleton className="size-10 shrink-0" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-5 w-2/5" />
            <Skeleton className="h-4 w-1/4" />
          </div>
          <Skeleton className="hidden h-10 w-80 sm:block" />
        </div>
      ))}
    </Card>
  );
}

function EmptyStocksState({ hasSearch, onCreate }: { hasSearch: boolean; onCreate: () => void }) {
  return (
    <div className="flex flex-col items-center gap-4 rounded-md border border-dashed px-6 py-16 text-center">
      <span
        aria-hidden
        className="flex size-10 items-center justify-center rounded-md bg-muted text-muted-foreground [&_svg]:size-5"
      >
        <PackageCheck />
      </span>
      <div className="space-y-1">
        <p className="font-semibold">
          {hasSearch ? "No stock found" : "You don't have any stock yet"}
        </p>
        <p className="text-sm text-muted-foreground">
          {hasSearch
            ? "Try a different product name or widen the filters."
            : "Add your first keys to start selling."}
        </p>
      </div>
      {!hasSearch && (
        <Button onClick={onCreate}>
          <Plus />
          Add stock
        </Button>
      )}
    </div>
  );
}

function getAvailability(count: number) {
  if (count < 5) {
    return {
      label: "Low stock",
      blocks: 1,
      badgeClassName: "border-negative text-negative",
      barClassName: "bg-negative",
    };
  }

  if (count < 15) {
    return {
      label: "Medium stock",
      blocks: 2,
      badgeClassName: "border-warning text-warning",
      barClassName: "bg-warning",
    };
  }

  if (count < 50) {
    return {
      label: "Good stock",
      blocks: 4,
      badgeClassName: "border-positive text-positive",
      barClassName: "bg-positive",
    };
  }

  return {
    label: "High stock",
    blocks: 5,
    badgeClassName: "border-positive text-positive",
    barClassName: "bg-positive",
  };
}
