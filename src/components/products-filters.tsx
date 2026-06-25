"use client";

import { useEffect, useState } from "react";
import { parseAsBoolean, parseAsString, parseAsStringLiteral, useQueryStates } from "nuqs";
import { useDebounceValue } from "usehooks-ts";

import {
  InputGroup,
  InputGroupAddon,
  InputGroupText,
  InputGroupInput,
} from "@/components/ui/input-group";

import { SearchIcon } from "lucide-react";
import { Switch } from "./ui/switch";

// Sort options shown in the select dropdown

export function ProductsFilters() {
  const [query, setQuery] = useQueryStates({
    sort: parseAsStringLiteral(["name", "price", "rating"] as const).withDefault("name"),
    dir: parseAsStringLiteral(["asc", "desc"] as const).withDefault("asc"),
    search: parseAsString.withDefault(""),
    showOutOfStock: parseAsBoolean.withDefault(false),
  });

  const [inputValue, setInputValue] = useState(query.search);
  const [debouncedInput] = useDebounceValue(inputValue, 400);

  useEffect(() => {
    if (debouncedInput === query.search) return;
    setQuery({ search: debouncedInput || "" });
  }, [debouncedInput]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <>
      <InputGroup>
        <InputGroupAddon>
          <InputGroupText>
            <SearchIcon />
          </InputGroupText>
        </InputGroupAddon>
        <InputGroupInput
          placeholder="Search by name..."
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
        />
      </InputGroup>

      <label className="flex items-center gap-2 cursor-pointer select-none text-sm">
        <Switch
          checked={query.showOutOfStock}
          onCheckedChange={(checked) => setQuery({ showOutOfStock: !!checked })}
        />
        Show out of stock
      </label>
    </>
  );
}
