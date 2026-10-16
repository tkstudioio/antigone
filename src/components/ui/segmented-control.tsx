"use client";

import * as React from "react";
import { ToggleGroup } from "radix-ui";

import { cn } from "@/lib/utils";

/**
 * Single-choice switch between a few views (e.g. which QR to show). Built on Radix ToggleGroup,
 * so it gets radio semantics and arrow-key navigation; a selection can never be cleared.
 */
function SegmentedControl<T extends string>({
  value,
  onValueChange,
  options,
  className,
  ...props
}: {
  value: T;
  onValueChange: (value: T) => void;
  options: { value: T; label: React.ReactNode }[];
  className?: string;
  "aria-label": string;
}) {
  return (
    <ToggleGroup.Root
      type="single"
      value={value}
      onValueChange={(next) => next && onValueChange(next as T)}
      data-slot="segmented-control"
      className={cn("grid auto-cols-fr grid-flow-col gap-1 rounded-md bg-muted p-1", className)}
      {...props}
    >
      {options.map((option) => (
        <ToggleGroup.Item
          key={option.value}
          value={option.value}
          className="inline-flex cursor-pointer items-center justify-center gap-2 rounded-sm px-3 py-1.5 text-sm font-medium whitespace-nowrap text-muted-foreground transition-colors outline-none hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 data-[state=on]:bg-background data-[state=on]:text-foreground data-[state=on]:shadow-xs [&_svg]:size-4 [&_svg]:shrink-0"
        >
          {option.label}
        </ToggleGroup.Item>
      ))}
    </ToggleGroup.Root>
  );
}

export { SegmentedControl };
