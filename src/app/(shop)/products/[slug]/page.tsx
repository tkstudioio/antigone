import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { ArrowLeft } from "lucide-react";
import { queryProductDetail } from "@/lib/backend/query-product-detail";

import { toProxySrc } from "@/components/product-image";
import { Button } from "@/components/ui/button";

import { ProductStockCard } from "@/components/product-stock-card";
import { Large } from "@/components/ui/typography";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const product = await queryProductDetail(slug);

  if (!product) {
    return { title: "Product not found" };
  }

  const canonical = `/products/${product.slug}`;

  return {
    title: product.name,
    description: product.description,
    alternates: { canonical },
    openGraph: {
      type: "website",
      title: product.name,
      description: product.description || "",
      url: canonical,
      images: product.imageUrl ? [{ url: product.imageUrl }] : undefined,
    },
    twitter: {
      card: product.imageUrl ? "summary_large_image" : "summary",
      title: product.name,
      description: product.description,
      images: product.imageUrl ? [product.imageUrl] : undefined,
    },
  };
}

export default async function ProductDetailPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const product = await queryProductDetail(slug);

  if (!product) return notFound();

  const cheapestStock = product.stocks[0];
  const otherStocks = product.stocks.filter((stock) => stock.price !== cheapestStock?.price);
  return (
    <>
      <Button asChild variant="ghost" action="muted" size="sm" className="w-max">
        <Link href="/products">
          <ArrowLeft />
          Back to catalog
        </Link>
      </Button>
      {product.imageUrl && (
        <Image
          src={toProxySrc(product.imageUrl)}
          alt={product.name}
          width={256}
          height={256}
          unoptimized
          className="aspect-video object-cover w-full transition-transform rounded-card"
        />
      )}
      {cheapestStock && <ProductStockCard stock={cheapestStock} />}

      {otherStocks.length > 0 && (
        <>
          <Large>Other stock</Large>
          {otherStocks.map((stock) => (
            <ProductStockCard key={`${stock.sellerPubkey}-${stock.price}`} stock={stock} />
          ))}
        </>
      )}
    </>
  );
}
