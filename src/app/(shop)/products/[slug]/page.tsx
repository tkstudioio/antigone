import { cache } from "react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { getServerSession } from "next-auth";
import { Archive, ArrowLeft, KeyRound, PackageX, ShieldCheck } from "lucide-react";

import { authOptions } from "@/lib/auth-options";
import { queryProductDetail } from "@/lib/backend/query-product-detail";
import { formatPrice } from "@/lib/utils";
import { toProxySrc } from "@/components/product-image";
import { Button } from "@/components/ui/button";
import { Rating } from "@/components/ui/rating";
import { H1, P } from "@/components/ui/typography";
import { Satoshi } from "@/components/icons/satoshi";
import { ProductSellers } from "@/components/product-sellers";

// One DB fetch per request, shared by generateMetadata and the page.
const getProduct = cache(queryProductDetail);

const DESCRIPTION_MAX = 160;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const product = await getProduct((await params).slug);
  if (!product) return { title: "Product not found" };

  const canonical = `/products/${product.slug}`;
  const description =
    product.description && product.description.length > DESCRIPTION_MAX
      ? `${product.description.slice(0, DESCRIPTION_MAX - 1).trimEnd()}…`
      : (product.description ?? undefined);

  return {
    title: product.name,
    description,
    alternates: { canonical },
    // Archived products stay reachable (links from past orders) but are no longer for sale.
    ...(product.archived ? { robots: { index: false } } : {}),
    openGraph: {
      type: "website",
      title: product.name,
      description,
      url: canonical,
      images: product.imageUrl ? [{ url: product.imageUrl }] : undefined,
    },
    twitter: {
      card: product.imageUrl ? "summary_large_image" : "summary",
      title: product.name,
      description,
      images: product.imageUrl ? [product.imageUrl] : undefined,
    },
  };
}

export default async function ProductDetailPage({ params }: { params: Promise<{ slug: string }> }) {
  const [product, session] = await Promise.all([
    getProduct((await params).slug),
    getServerSession(authOptions),
  ]);
  if (!product) notFound();

  const { stocks } = product;
  const bestPrice = stocks[0]?.price ?? null;
  const totalKeys = stocks.reduce((sum, s) => sum + s.availableCount, 0);
  const sellerCount = new Set(stocks.map((s) => s.sellerPubkey)).size;

  return (
    <div className="space-y-16 pb-24">
      <div className="space-y-8">
        <Button asChild variant="ghost" action="muted" size="sm" className="w-max">
          <Link href="/products">
            <ArrowLeft />
            Back to catalog
          </Link>
        </Button>

        <section className="grid gap-10 lg:grid-cols-2 lg:items-start">
          <div className="flex aspect-video items-center justify-center overflow-hidden rounded-md bg-muted">
            {product.imageUrl ? (
              <Image
                src={toProxySrc(product.imageUrl)}
                alt={product.name}
                width={768}
                height={432}
                unoptimized
                priority
                className="size-full object-cover"
              />
            ) : (
              <KeyRound className="size-12 text-muted-foreground" aria-hidden />
            )}
          </div>

          <div className="space-y-6">
            <div className="space-y-3">
              <span className="font-mono text-xs tracking-widest text-muted-foreground uppercase">
                License key
              </span>
              <H1 className="text-3xl text-balance lg:text-4xl">{product.name}</H1>
              {product.rating != null && <Rating rating={product.rating} />}
            </div>

            {product.description && (
              <P className="text-pretty whitespace-pre-line text-muted-foreground">
                {product.description}
              </P>
            )}

            <dl className="grid grid-cols-3 gap-4 rounded-md bg-muted p-4 text-sm">
              <div className="space-y-1">
                <dt className="text-xs text-muted-foreground">Best price</dt>
                <dd className="flex items-center text-lg font-semibold tabular-nums">
                  {bestPrice != null ? (
                    <>
                      <Satoshi className="size-5 shrink-0" aria-hidden />
                      {formatPrice(bestPrice)}
                      <span className="sr-only"> sats</span>
                    </>
                  ) : (
                    "—"
                  )}
                </dd>
              </div>
              <div className="space-y-1">
                <dt className="text-xs text-muted-foreground">Available</dt>
                <dd className="text-lg font-semibold tabular-nums">
                  {totalKeys.toLocaleString("en-US")}
                </dd>
              </div>
              <div className="space-y-1">
                <dt className="text-xs text-muted-foreground">Sellers</dt>
                <dd className="text-lg font-semibold tabular-nums">
                  {sellerCount.toLocaleString("en-US")}
                </dd>
              </div>
            </dl>

            <p className="flex items-start gap-2 text-sm text-pretty text-muted-foreground">
              <ShieldCheck className="mt-0.5 size-4 shrink-0" aria-hidden />
              You pay into an escrow, not to the seller: the funds are released only when the trade
              completes, and the code is encrypted so only you can read it.
            </p>
          </div>
        </section>
      </div>

      <section aria-labelledby="sellers-heading" className="space-y-6">
        <div className="space-y-2">
          <span className="font-mono text-xs tracking-widest text-muted-foreground uppercase">
            Buy
          </span>
          <h2 id="sellers-heading" className="text-2xl font-bold">
            All sellers
          </h2>
          <P className="text-pretty text-muted-foreground">
            Pick any seller, not only the cheapest. Keys are held in your cart for 10 minutes.
          </P>
        </div>

        {stocks.length > 0 ? (
          <ProductSellers stocks={stocks} viewerPubkey={session?.user.pubkey ?? null} />
        ) : (
          <div className="flex flex-col items-center gap-4 rounded-md border border-dashed px-6 py-16 text-center">
            <span
              aria-hidden
              className="flex size-10 items-center justify-center rounded-md bg-muted text-muted-foreground [&_svg]:size-5"
            >
              {product.archived ? <Archive /> : <PackageX />}
            </span>
            <div className="space-y-1">
              <p className="font-semibold">
                {product.archived ? "No longer available" : "Out of stock"}
              </p>
              <p className="text-sm text-muted-foreground">
                {product.archived
                  ? "This product has been removed from the catalog and can no longer be bought."
                  : "No seller has keys for this product right now."}
              </p>
            </div>
            <Button asChild variant="outline" action="muted" size="sm">
              <Link href="/products">Browse the catalog</Link>
            </Button>
          </div>
        )}
      </section>
    </div>
  );
}
