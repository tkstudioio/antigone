"use client";

import { useMemo } from "react";
import { toSvg } from "jdenticon";
import { cn } from "@/lib/utils";

export function Identicon({
  value,
  size = 40,
  className,
}: {
  value: string;
  size?: number;
  className?: string;
}) {
  // An inline size keeps the generated <svg> from being squashed by a parent's descendant rule
  // (shadcn Button's `[&_svg:not([class*='size-'])]:size-4`, SidebarMenuButton's `[&_svg]:size-4`):
  // inline styles beat any class selector, whatever its specificity.
  const svg = useMemo(
    () =>
      toSvg(value, size).replace("<svg", '<svg class="size-full" style="width:100%;height:100%"'),
    [value, size]
  );

  return (
    <div
      className={cn("shrink-0 overflow-hidden rounded-full", className)}
      style={{ width: size, height: size }}
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
}
