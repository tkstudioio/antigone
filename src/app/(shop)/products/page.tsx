import { createLoader } from "nuqs/server";

import { queryProducts } from "@/lib/backend/query-products";
import { productsSearchParams } from "@/lib/products-search-params";
import { H1, P } from "@/components/ui/typography";

import { Card, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";

import Image from "next/image";
import { formatPrice } from "@/lib/utils";
import { Satoshi } from "@/components/icons/satoshi";
import { toProxySrc } from "@/components/product-image";
import Link from "next/link";
import { ProductsPagination } from "@/components/products-pagination";

const loadSearchParams = createLoader(productsSearchParams);

export default async function ProductPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { sort, dir, page, search, showOutOfStock } = await loadSearchParams(searchParams);

  const initialData = await queryProducts({
    search,
    sort,
    dir,
    page,
    withStock: showOutOfStock ? undefined : true,
  });

  return (
    <>
      <H1>Products</H1>
      <div className="grid grid-cols-2 gap-md">
        {initialData.data.map((product) => {
          const hasStock = product.availableKeysCount > 0;

          return (
            <Link key={product.id} href={`/products/${product.slug}`} className="group">
              <Card variant={"ghost"}>
                {product.imageUrl && (
                  <Image
                    src={toProxySrc(product.imageUrl)}
                    alt={product.name}
                    width={256}
                    height={256}
                    unoptimized
                    className="aspect-video object-cover w-full transition-transform"
                  />
                )}
                <CardHeader className="px-0!">
                  <CardTitle>{product.name}</CardTitle>
                  <CardDescription>
                    {hasStock ? (
                      <>
                        <Satoshi className="inline size-6" />
                        {formatPrice(product.lowestPrice)}
                      </>
                    ) : (
                      <P className="text-negative">Out of stock</P>
                    )}
                  </CardDescription>
                </CardHeader>
              </Card>
            </Link>
          );
        })}
      </div>
      {initialData.pageCount > 1 && <ProductsPagination pageCount={initialData.pageCount} />}
    </>
  );
}
