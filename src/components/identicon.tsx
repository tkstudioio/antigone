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
  // The `size-full` class keeps the generated <svg> from being squashed by a
  // parent's `[&_svg:not([class*='size-'])]:size-4` rule (e.g. shadcn Button).
  const svg = useMemo(
    () => toSvg(value, size).replace("<svg", '<svg class="size-full"'),
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
