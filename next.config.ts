import type { NextConfig } from "next";

// Product images live in the object store and are rendered through the same-origin proxy
// `/api/images/...` (see `toProxySrc` in src/components/product-image.tsx), which needs no
// `remotePatterns` entry. Allowing remote hosts here would turn the image optimizer into an open
// fetcher (SSRF + exposure of optimizer CVEs), so production allows none. The only remote images
// are the picsum.photos placeholders produced by `pnpm db:seed`, so they are permitted in dev only.
const isDev = process.env.NODE_ENV === "development";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: isDev ? [{ protocol: "https", hostname: "picsum.photos" }] : [],
  },
};

export default nextConfig;
