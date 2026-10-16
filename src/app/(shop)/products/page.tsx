import { createLoader, createSerializer } from "nuqs/server";
import { PackageSearch } from "lucide-react";

import { queryProducts } from "@/lib/backend/query-products";
import { productsSearchParams } from "@/lib/products-search-params";
import { H1, P } from "@/components/ui/typography";
import { ProductsFilters } from "@/components/products-filters";
import { ProductsPagination } from "@/components/products-pagination";
import { ProductTile } from "@/components/product-tile";

const loadSearchParams = createLoader(productsSearchParams);
const serialize = createSerializer(productsSearchParams);

export default async function ProductsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await loadSearchParams(searchParams);
  const { sort, dir, page, search, showOutOfStock } = params;

  const {
    data: products,
    total,
    pageCount,
  } = await queryProducts({
    search,
    sort,
    dir,
    page,
    withStock: showOutOfStock ? undefined : true,
  });

  return (
    <div className="space-y-8 pb-24">
      <div className="space-y-2">
        <span className="font-mono text-xs tracking-widest text-muted-foreground uppercase">
          Catalog
        </span>
        <H1 className="text-3xl">Products</H1>
        <P className="max-w-xl text-pretty text-muted-foreground">
          License keys sold by independent sellers. Every purchase is paid into an escrow: the
          seller is paid only when the trade completes.
        </P>
      </div>

      <ProductsFilters />

      {products.length === 0 ? (
        <div className="flex flex-col items-center gap-4 rounded-md border border-dashed px-6 py-16 text-center">
          <span
            aria-hidden
            className="flex size-10 items-center justify-center rounded-md bg-muted text-muted-foreground [&_svg]:size-5"
          >
            <PackageSearch />
          </span>
          <div className="space-y-1">
            <p className="font-semibold">No products found</p>
            <p className="text-sm text-muted-foreground">
              {search
                ? "Try a different name."
                : showOutOfStock
                  ? "The catalog is empty."
                  : "Nothing is in stock right now. Try showing out-of-stock products too."}
            </p>
          </div>
        </div>
      ) : (
        <section aria-label="Products" className="space-y-6">
          <p className="text-sm text-muted-foreground" aria-live="polite">
            {total.toLocaleString("en-US")} product{total === 1 ? "" : "s"}
          </p>
          <ul className="grid gap-x-6 gap-y-10 sm:grid-cols-2 lg:grid-cols-4">
            {products.map((product) => (
              <li key={product.id}>
                <ProductTile product={product} />
              </li>
            ))}
          </ul>
        </section>
      )}

      {pageCount > 1 && (
        <ProductsPagination
          page={page}
          pageCount={pageCount}
          href={(p) => serialize("/products", { ...params, page: p })}
        />
      )}
    </div>
  );
}
