import * as React from "react";
import type { LucideProps } from "lucide-react";
import { cn } from "@/lib/utils";

const Satoshi = React.forwardRef<SVGSVGElement, LucideProps>(
  (
    {
      className,
      color = "currentColor",
      size = 24,
      strokeWidth = 2,
      absoluteStrokeWidth,
      ...props
    },
    ref
  ) => {
    const calculatedStrokeWidth = absoluteStrokeWidth
      ? (Number(strokeWidth) * 24) / Number(size)
      : strokeWidth;

    return (
      <svg
        ref={ref}
        width={size}
        height={size}
        viewBox="0 0 24 24"
        xmlns="http://www.w3.org/2000/svg"
        fill="none"
        stroke={color}
        strokeWidth={calculatedStrokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
        className={cn("lucide lucide-satoshi", className)}
        aria-hidden={props["aria-label"] || props["aria-labelledby"] ? undefined : true}
        {...props}
      >
        <path d="M7 7.90906H17" />
        <path d="M12 5.45454V3" />
        <path d="M12 20.9999V18.5454" />
        <path d="M7 12H17" />
        <path d="M7 16.0909H17" />
      </svg>
    );
  }
);

Satoshi.displayName = "Satoshi";

export { Satoshi };
