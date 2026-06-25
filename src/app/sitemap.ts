import type { MetadataRoute } from "next";

import { db } from "@/db";

const BASE_URL = process.env.NEXTAUTH_URL ?? "http://localhost:3000";

// Lists the public, indexable surface: home, the catalog entry point, and one
// entry per product detail page (the real SEO targets). Dynamic so new products
// appear without a rebuild.
export const dynamic = "force-dynamic";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const products = await db.product.findMany({
    select: { slug: true, createdAt: true },
    orderBy: { createdAt: "desc" },
  });

  const productRoutes: MetadataRoute.Sitemap = products.map((p) => ({
    url: `${BASE_URL}/products/${p.slug}`,
    lastModified: p.createdAt,
    changeFrequency: "daily",
    priority: 0.8,
  }));

  return [
    { url: BASE_URL, changeFrequency: "weekly", priority: 1 },
    { url: `${BASE_URL}/products`, changeFrequency: "daily", priority: 0.9 },
    ...productRoutes,
  ];
}
