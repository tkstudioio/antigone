import Link from "next/link";
import { Archive, ArrowLeft } from "lucide-react";
import { notFound } from "next/navigation";
import { db } from "@/db";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { H1, P } from "@/components/ui/typography";
import { StocksDetail } from "@/components/stocks-detail";

export default async function StocksDetailPage({
  params,
}: {
  params: Promise<{ productSlug: string }>;
}) {
  const { productSlug } = await params;

  const productRow = await db.product.findUnique({
    where: { slug: productSlug },
    select: { id: true, name: true, slug: true, archivedAt: true },
  });

  if (!productRow) {
    notFound();
  }

  return (
    <div className="mx-auto max-w-5xl space-y-8 pb-16">
      <div className="space-y-4">
        <Button variant="ghost" action="muted" size="sm" className="-ml-2" asChild>
          <Link href="/stocks">
            <ArrowLeft />
            Back to stocks
          </Link>
        </Button>
        <div className="space-y-2">
          <span className="font-mono text-xs tracking-widest text-muted-foreground uppercase">
            Stock
          </span>
          <H1 className="text-3xl text-balance">{productRow.name}</H1>
          <P className="max-w-xl text-pretty text-muted-foreground">
            Each price tier groups the keys you sell at the same price. Codes are decrypted only
            here, in your browser.
          </P>
        </div>
      </div>
      {productRow.archivedAt && (
        <Alert action="negative">
          <Archive aria-hidden />
          <AlertTitle>This product has been archived</AlertTitle>
          <AlertDescription>
            It is no longer listed in the shop: these keys cannot be bought and no new stock can be
            added. You can still delete them.
          </AlertDescription>
        </Alert>
      )}
      <StocksDetail productId={productRow.id} productName={productRow.name} />
    </div>
  );
}
