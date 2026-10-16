/** Absolute URLs and root paths are used as-is; anything else is a bucket key served by `/api/images`. */
export function toProxySrc(src: string): string {
  if (src.startsWith("/") || src.startsWith("http")) return src;
  return `/api/images/${src}`;
}
