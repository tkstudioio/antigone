import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { Slot } from "radix-ui";

import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "group/button inline-flex shrink-0 items-center justify-center rounded-sm border border-transparent bg-clip-padding whitespace-nowrap transition-all outline-none select-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 active:not-aria-[haspopup]:translate-y-px disabled:pointer-events-none disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40 [&_svg]:pointer-events-none [&_svg]:shrink-0 cursor-pointer",
  {
    variants: {
      action: {
        primary: "bg-primary text-primary-foreground",
        positive: "bg-positive text-positive-foreground",
        negative: "bg-negative text-negative-foreground",
        warning: "bg-warning text-warning-foreground",
        muted: "bg-muted text-muted-foreground",
      },
      variant: {
        solid: "",
        outline: "border border-2 bg-transparent hover:bg-accent hover:text-accent-foreground",
        ghost: "bg-transparent",
      },
      size: {
        lg: "px-8 py-4 gap-4 [&_svg:not([class*='size-'])]:size-5",
        md: "px-4 py-2 gap-2 [&_svg:not([class*='size-'])]:size-4",
        sm: "px-2 py-1 gap-1 [&_svg:not([class*='size-'])]:size-3.5",
      },
    },
    compoundVariants: [
      {
        variant: "outline",
        action: "primary",
        className: "border-primary text-foreground",
      },
      {
        variant: "outline",
        action: "positive",
        className: "border-positive text-foreground",
      },
      {
        variant: "outline",
        action: "negative",
        className: "border-negative text-foreground",
      },
      {
        variant: "outline",
        action: "warning",
        className: "border-warning text-foreground",
      },
      {
        variant: "outline",
        action: "muted",
        className: "border-border text-foreground",
      },

      {
        variant: "ghost",
        action: "primary",
        className: "hover:bg-primary text-primary hover:text-primary-foreground",
      },
      {
        variant: "ghost",
        action: "positive",
        className: "hover:bg-positive text-positive hover:text-positive-foreground",
      },
      {
        variant: "ghost",
        action: "negative",
        className: "hover:bg-negative text-negative hover:text-negative-foreground",
      },
      {
        variant: "ghost",
        action: "warning",
        className: "hover:bg-warning text-warning hover:text-warning-foreground",
      },
      {
        variant: "ghost",
        action: "muted",
        className: "hover:bg-muted text-muted-foreground hover:text-foreground",
      },
    ],
  }
);

function Button({
  className,
  variant = "solid",
  action = "primary",
  size = "md",
  asChild = false,
  ...props
}: React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean;
  }) {
  const Comp = asChild ? Slot.Root : "button";

  return (
    <Comp
      data-slot="button"
      data-variant={variant}
      data-action={action}
      data-size={size}
      className={cn(buttonVariants({ action, variant, size, className }))}
      {...props}
    />
  );
}

export { Button, buttonVariants };
