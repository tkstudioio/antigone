const BUCKET = process.env.NEXT_PUBLIC_MINIO_BUCKET;

export function toProxySrc(src: string): string {
  if (src.startsWith("/")) return src;
  if (src.startsWith("http")) {
    try {
      const url = new URL(src);
      const segments = url.pathname.split("/").filter(Boolean);
      if (segments[0] === BUCKET) {
        return `/api/images/${segments.slice(1).join("/")}`;
      }
    } catch {}
    return src;
  }
  return `/api/images/${src}`;
}
