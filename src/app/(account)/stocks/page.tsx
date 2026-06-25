"use client";

import { useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { match } from "ts-pattern";
import { parseAsInteger, parseAsString, parseAsStringLiteral, useQueryStates } from "nuqs";
import { useDebounceValue } from "usehooks-ts";
import {
  ArrowUpDown,
  Boxes,
  ChevronLeft,
  ChevronRight,
  Coins,
  Layers,
  PackageCheck,
  Search,
  SlidersHorizontal,
  X,
  type LucideIcon,
} from "lucide-react";

import type { SortDir, StockProduct, StockSortColumn } from "@/hooks/stocks";
import { useStockProducts } from "@/hooks/stocks";
import { cn, formatPrice } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Skeleton } from "@/components/ui/skeleton";
import { H1 } from "@/components/ui/typography";
import { CreateStockSheet } from "@/components/create-stock-sheet";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from "@/components/ui/input-group";

const stockSortOptions: {
  label: string;
  sort: StockSortColumn;
  dir: SortDir;
  icon: LucideIcon;
}[] = [
  { label: "Name", sort: "name", dir: "asc", icon: ArrowUpDown },
  { label: "Available", sort: "availableKeysCount", dir: "desc", icon: PackageCheck },
  { label: "Lowest price", sort: "lowestPrice", dir: "asc", icon: Coins },
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
    <>
      <div className="flex flex-col gap-md sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-xs">
          <p className="text-xs font-medium uppercase tracking-wide text-muted">Warehouse</p>
          <H1>Your stocks</H1>
        </div>

        <Button onClick={() => setSheetOpen(true)} className="w-full sm:w-auto">
          <Boxes className="size-4" />
          Add stock
        </Button>

        <CreateStockSheet open={sheetOpen} onOpenChange={setSheetOpen} mode="create" />
      </div>

      <div className="grid gap-md lg:grid-cols-[18rem_minmax(0,1fr)]">
        <Card className="h-fit">
          <CardHeader className="gap-md">
            <div className="flex items-center gap-sm text-sm font-semibold">
              <SlidersHorizontal className="size-4 text-primary" />
              Filters
            </div>
          </CardHeader>

          <CardContent className="space-y-md">
            <FilterSection label="Name">
              <InputGroup>
                <InputGroupAddon>
                  <Search className="size-4" />
                </InputGroupAddon>
                <InputGroupInput
                  placeholder="Search product"
                  value={inputValue}
                  onChange={(e) => setInputValue(e.target.value)}
                />
                <InputGroupButton
                  aria-label="Clear search"
                  disabled={inputValue.length === 0 && query.search.length === 0}
                  onClick={() => {
                    setInputValue("");
                    setQuery({ search: "", page: 1 });
                  }}
                >
                  <X />
                </InputGroupButton>
              </InputGroup>
            </FilterSection>

            <FilterSection
              label="Price"
              value={`${formatPrice(priceRange[0])} - ${formatPrice(priceRange[1])}`}
            >
              <Slider
                min={0}
                max={PRICE_FILTER_MAX}
                step={50_000}
                value={priceRange}
                onValueChange={(value) =>
                  setPriceRange([value[0] ?? 0, value[1] ?? PRICE_FILTER_MAX])
                }
              />
            </FilterSection>

            <FilterSection
              label="Available keys"
              value={`${keysRange[0].toLocaleString("en-US")} - ${keysRange[1].toLocaleString("en-US")}`}
            >
              <Slider
                min={0}
                max={KEYS_FILTER_MAX}
                step={1}
                value={keysRange}
                onValueChange={(value) =>
                  setKeysRange([value[0] ?? 0, value[1] ?? KEYS_FILTER_MAX])
                }
              />
            </FilterSection>
          </CardContent>

          <CardContent className="space-y-sm border-t border-border/50 pt-md">
            <p className="text-xs font-medium uppercase tracking-wide text-muted">Sort by</p>
            <div className="grid gap-xs">
              {stockSortOptions.map((option) => {
                const Icon = option.icon;
                const active = query.sort === option.sort && query.dir === option.dir;

                return (
                  <Button
                    key={`${option.sort}-${option.dir}`}
                    type="button"
                    variant={active ? "solid" : "ghost"}
                    action={active ? "primary" : "muted"}
                    size="sm"
                    className="justify-start"
                    onClick={() => setQuery({ sort: option.sort, dir: option.dir, page: 1 })}
                  >
                    <Icon className="size-3.5" />
                    {option.label}
                  </Button>
                );
              })}
            </div>
          </CardContent>

          <CardFooter>
            <Button
              className="w-full"
              variant="ghost"
              action="negative"
              disabled={!hasActiveFilters}
              onClick={clearFilters}
            >
              <X className="size-4" />
              Clear
            </Button>
          </CardFooter>
        </Card>

        <section className="min-w-0 space-y-md">
          {match(stocksQuery)
            .with({ isPending: true }, () => <StockCardsSkeleton />)
            .with({ isError: true }, () => (
              <Card>
                <CardContent>
                  <p className="text-sm text-destructive">Error loading stocks.</p>
                </CardContent>
              </Card>
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
                  <div className="flex flex-col gap-sm sm:flex-row sm:items-end sm:justify-between">
                    <div>
                      <p className="text-xs font-medium uppercase tracking-wide text-muted">
                        Active stocks
                      </p>
                      <p className="text-2xl font-semibold">
                        {visibleTotal.toLocaleString("en-US")} product
                        {visibleTotal === 1 ? "" : "s"}
                      </p>
                    </div>
                    <Badge variant="outline" className="h-7 px-3">
                      Page {query.page.toLocaleString("en-US")} of{" "}
                      {totalPages.toLocaleString("en-US")}
                    </Badge>
                  </div>

                  <div className="space-y-md">
                    {filteredRows.map((row) => (
                      <StockProductCard key={row.productId} stock={row} />
                    ))}
                  </div>

                  {totalPages > 1 && (
                    <div className="flex flex-col gap-sm sm:flex-row sm:items-center sm:justify-end">
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={query.page <= 1}
                        onClick={() => setQuery({ page: query.page - 1 })}
                      >
                        <ChevronLeft className="size-4" />
                        Previous
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={query.page >= totalPages}
                        onClick={() => setQuery({ page: query.page + 1 })}
                      >
                        Next
                        <ChevronRight className="size-4" />
                      </Button>
                    </div>
                  )}
                </>
              );
            })
            .otherwise(() => null)}
        </section>
      </div>
    </>
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
    <div className="space-y-sm">
      <div className="flex min-w-0 items-center justify-between gap-sm">
        <p className="shrink-0 text-xs font-medium uppercase tracking-wide text-muted">{label}</p>
        {value ? (
          <span className="min-w-0 truncate text-right text-xs text-muted">{value}</span>
        ) : null}
      </div>
      {children}
    </div>
  );
}

function StockProductCard({ stock }: { stock: StockProduct }) {
  const availability = getAvailability(stock.availableKeysCount);
  const priceSpread = stock.highestPrice - stock.lowestPrice;
  const hasPriceRange = priceSpread > 0;
  const averageKeysPerTier = Math.max(1, Math.round(stock.availableKeysCount / stock.priceTiers));

  return (
    <Card className="border-border/70 bg-fill/90 transition hover:-translate-y-0.5 hover:ring-1 hover:ring-primary/35">
      <CardHeader className="gap-md">
        <div className="flex flex-col gap-md sm:flex-row sm:items-start sm:justify-between">
          <div className="flex min-w-0 items-start gap-md">
            <div className="flex size-11 shrink-0 items-center justify-center rounded-card border border-primary/30 bg-primary/10 text-primary">
              <Boxes className="size-5" />
            </div>
            <div className="min-w-0 space-y-sm">
              <div className="min-w-0">
                <CardTitle className="truncate text-xl">
                  <Link href={`/stocks/${stock.slug}`} className="hover:text-primary">
                    {stock.name}
                  </Link>
                </CardTitle>
              </div>
              <div className="flex flex-wrap gap-xs">
                <Badge variant="outline" action="muted" className="gap-xs">
                  <Layers className="size-3" />
                  {stock.priceTiers.toLocaleString("en-US")}{" "}
                  {stock.priceTiers === 1 ? "tier" : "tiers"}
                </Badge>
                <Badge variant="outline" className={availability.badgeClassName}>
                  {availability.label}
                </Badge>
              </div>
            </div>
          </div>

          <Button asChild variant="outline" size="sm" className="w-full sm:w-auto">
            <Link href={`/stocks/${stock.slug}`}>
              Manage
              <ChevronRight className="size-4" />
            </Link>
          </Button>
        </div>
      </CardHeader>

      <CardContent className="grid gap-sm md:grid-cols-3">
        <StockMetric
          icon={PackageCheck}
          label="Keys"
          value={stock.availableKeysCount.toLocaleString("en-US")}
          detail={`${averageKeysPerTier.toLocaleString("en-US")} per tier`}
        />
        <StockMetric
          icon={Coins}
          label="Lowest price"
          value={formatPrice(stock.lowestPrice)}
          detail={hasPriceRange ? `Max ${formatPrice(stock.highestPrice)}` : "Single price"}
        />
        <StockMetric
          icon={ArrowUpDown}
          label="Range"
          value={hasPriceRange ? formatPrice(priceSpread) : "0 sats"}
          detail={hasPriceRange ? "Price difference" : "No spread"}
        />
      </CardContent>

      <CardFooter className="flex-col items-stretch gap-sm sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-sm">
          <span className="text-xs font-medium uppercase tracking-wide text-muted">Stock</span>
          <div className="grid w-28 grid-cols-5 gap-1" aria-hidden="true">
            {Array.from({ length: 5 }).map((_, index) => (
              <span
                key={index}
                className={cn(
                  "h-1.5 rounded-full",
                  index < availability.blocks ? availability.barClassName : "bg-foreground/10"
                )}
              />
            ))}
          </div>
        </div>
        <p className="text-xs text-muted">
          From {formatPrice(stock.lowestPrice)}
          {hasPriceRange ? ` to ${formatPrice(stock.highestPrice)}` : ""}
        </p>
      </CardFooter>
    </Card>
  );
}

function StockMetric({
  icon: Icon,
  label,
  value,
  detail,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  detail: string;
}) {
  return (
    <div className="min-w-0 rounded-card border border-border/60 bg-background/40 p-md">
      <div className="mb-sm flex items-center gap-xs text-xs font-medium uppercase tracking-wide text-muted">
        <Icon className="size-3.5" />
        {label}
      </div>
      <p className="truncate text-lg font-semibold">{value}</p>
      <p className="truncate text-xs text-muted">{detail}</p>
    </div>
  );
}

function StockCardsSkeleton() {
  return (
    <div className="space-y-md">
      {Array.from({ length: 4 }).map((_, index) => (
        <Card key={index}>
          <CardHeader>
            <div className="flex items-start gap-md">
              <Skeleton className="size-11 rounded-card" />
              <div className="flex-1 space-y-sm">
                <Skeleton className="h-6 w-2/5" />
                <Skeleton className="h-5 w-1/4" />
              </div>
              <Skeleton className="h-9 w-24" />
            </div>
          </CardHeader>
          <CardContent className="grid gap-sm md:grid-cols-3">
            <Skeleton className="h-24" />
            <Skeleton className="h-24" />
            <Skeleton className="h-24" />
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function EmptyStocksState({ hasSearch, onCreate }: { hasSearch: boolean; onCreate: () => void }) {
  return (
    <Card>
      <CardContent className="flex flex-col items-center gap-md py-xl text-center">
        <div className="flex size-12 items-center justify-center rounded-card border border-primary/30 bg-primary/10 text-primary">
          <PackageCheck className="size-6" />
        </div>
        <div className="space-y-xs">
          <p className="text-xl font-semibold">
            {hasSearch ? "No stock found" : "You don't have any stock yet"}
          </p>
          <p className="text-sm text-muted">
            {hasSearch ? "Try a different product name." : "Add your first keys to start selling."}
          </p>
        </div>
        {!hasSearch && (
          <Button onClick={onCreate}>
            <Boxes className="size-4" />
            Add stock
          </Button>
        )}
      </CardContent>
    </Card>
  );
}

function getAvailability(count: number) {
  if (count < 5) {
    return {
      label: "Low stock",
      blocks: 1,
      badgeClassName: "border-negative/40 bg-negative/15",
      barClassName: "bg-negative",
    };
  }

  if (count < 15) {
    return {
      label: "Medium stock",
      blocks: 2,
      badgeClassName: "border-warning/40 bg-warning/15",
      barClassName: "bg-warning",
    };
  }

  if (count < 50) {
    return {
      label: "Good stock",
      blocks: 4,
      badgeClassName: "border-positive/40 bg-positive/15",
      barClassName: "bg-positive",
    };
  }

  return {
    label: "High stock",
    blocks: 5,
    badgeClassName: "border-positive/40 bg-positive/20",
    barClassName: "bg-positive",
  };
}
