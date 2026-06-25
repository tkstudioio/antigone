import type { MetadataRoute } from "next";

const BASE_URL = process.env.NEXTAUTH_URL ?? "http://localhost:3000";

// Allow crawling the public storefront; keep the authenticated/admin areas out.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/api/", "/cart", "/wallet", "/stocks", "/orders", "/disputes"],
    },
    sitemap: `${BASE_URL}/sitemap.xml`,
  };
}
