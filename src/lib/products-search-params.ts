import { parseAsBoolean, parseAsString, parseAsInteger, parseAsStringLiteral } from "nuqs/server";

// Shared nuqs parser map for the products list URL state.
// Imported by both the client component (`useQueryStates`) and the server page
// (`createLoader`) so SSR and the first client render parse with identical defaults.
export const productsSearchParams = {
  sort: parseAsStringLiteral(["name", "price", "rating"] as const).withDefault("name"),
  dir: parseAsStringLiteral(["asc", "desc"] as const).withDefault("asc"),
  page: parseAsInteger.withDefault(1),
  search: parseAsString.withDefault(""),
  showOutOfStock: parseAsBoolean.withDefault(false),
};
