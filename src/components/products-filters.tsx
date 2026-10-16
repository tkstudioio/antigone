"use client";

import { useEffect, useState, useTransition } from "react";
import { useQueryStates } from "nuqs";
import { useDebounceValue } from "usehooks-ts";
import { Loader2, SearchIcon, X } from "lucide-react";

import { productsSearchParams } from "@/lib/products-search-params";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from "@/components/ui/input-group";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { Switch } from "@/components/ui/switch";

const sortOptions = [
  { value: "name", label: "Name", sort: "name", dir: "asc" },
  { value: "price", label: "Lowest price", sort: "price", dir: "asc" },
  { value: "rating", label: "Top rated", sort: "rating", dir: "desc" },
] as const;

export function ProductsFilters() {
  // The list is rendered on the server: every URL change refetches it (shallow: false),
  // inside a transition so the pending state can be shown here.
  const [isPending, startTransition] = useTransition();
  const [query, setQuery] = useQueryStates(productsSearchParams, {
    shallow: false,
    startTransition,
  });

  const [inputValue, setInputValue] = useState(query.search);
  const [debouncedInput] = useDebounceValue(inputValue, 400);

  useEffect(() => {
    if (debouncedInput === query.search) return;
    void setQuery({ search: debouncedInput, page: 1 });
  }, [debouncedInput]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
      <InputGroup className="lg:max-w-sm">
        <InputGroupAddon>
          {isPending ? <Loader2 className="animate-spin" /> : <SearchIcon />}
        </InputGroupAddon>
        <InputGroupInput
          placeholder="Search product"
          aria-label="Search product"
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
        />
        {inputValue.length > 0 && (
          <InputGroupAddon align="inline-end">
            <InputGroupButton
              aria-label="Clear search"
              onClick={() => {
                setInputValue("");
                void setQuery({ search: "", page: 1 });
              }}
            >
              <X />
            </InputGroupButton>
          </InputGroupAddon>
        )}
      </InputGroup>

      <div className="flex flex-wrap items-center gap-4 lg:ml-auto">
        <SegmentedControl
          aria-label="Sort by"
          className="flex-1 sm:flex-none"
          value={query.sort}
          onValueChange={(value) => {
            const option = sortOptions.find((o) => o.value === value);
            if (option) void setQuery({ sort: option.sort, dir: option.dir, page: 1 });
          }}
          options={sortOptions.map((o) => ({ value: o.value, label: o.label }))}
        />
        <label className="flex min-h-11 cursor-pointer items-center gap-2 text-sm select-none">
          <Switch
            checked={query.showOutOfStock}
            onCheckedChange={(checked) => void setQuery({ showOutOfStock: checked, page: 1 })}
          />
          Show out of stock
        </label>
      </div>
    </div>
  );
}
