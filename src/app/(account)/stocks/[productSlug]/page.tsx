import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { notFound } from "next/navigation";
import { db } from "@/db";
import { Button } from "@/components/ui/button";
import { StocksDetail } from "@/components/stocks-detail";

export default async function StocksDetailPage({
  params,
}: {
  params: Promise<{ productSlug: string }>;
}) {
  const { productSlug } = await params;

  const productRow = await db.product.findUnique({
    where: { slug: productSlug },
    select: { id: true, name: true, slug: true },
  });

  if (!productRow) {
    notFound();
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Button variant="ghost" size="sm" asChild>
          <Link href="/stocks">
            <ArrowLeft className="size-4" />
            Back to stocks
          </Link>
        </Button>
      </div>
      <h1 className="text-2xl font-semibold">{productRow.name}</h1>
      <StocksDetail
        productId={productRow.id}
        productName={productRow.name}
        productSlug={productRow.slug}
      />
    </div>
  );
}
