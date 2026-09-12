import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { Slot } from "radix-ui";

import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "group/badge inline-flex rounded-full px-2 transition-colors border-2 border-transparent",
  {
    variants: {
      action: {
        primary: "bg-primary text-primary-foreground",
        muted: "border-border bg-muted text-muted-foreground",
        negative: "bg-negative text-negative-foreground",
        positive: "border-positive bg-positive text-positive-foreground",
      },
      variant: {
        solid: "border-transparent",
        outline: "bg-transparent border-primary text-primary",
      },
    },
    defaultVariants: {
      variant: "outline",
      action: "negative",
    },
    compoundVariants: [
      {
        variant: "outline",
        action: "negative",
        className: "border-negative text-negative",
      },
      {
        variant: "outline",
        action: "positive",
        className: "border-positive text-positive",
      },
      {
        variant: "outline",
        action: "muted",
        className: "border-border text-muted-foreground",
      },
    ],
  }
);

function Badge({
  className,
  variant = "solid",
  action = "primary",
  asChild = false,
  ...props
}: React.ComponentProps<"span"> & VariantProps<typeof badgeVariants> & { asChild?: boolean }) {
  const Comp = asChild ? Slot.Root : "span";

  return (
    <Comp
      data-slot="badge"
      data-variant={variant}
      data-action={action}
      className={cn(badgeVariants({ variant, action }), className)}
      {...props}
    />
  );
}

type BadgeAction = NonNullable<VariantProps<typeof badgeVariants>["action"]>;
type BadgeVariant = NonNullable<VariantProps<typeof badgeVariants>["variant"]>;

/** Props for tinting a Badge by semantic state — spread onto `<Badge {...} />`. */
export type BadgeStyle = { action: BadgeAction; variant: BadgeVariant };

export { Badge, badgeVariants };
export type { BadgeAction, BadgeVariant };
