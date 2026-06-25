import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { Slot } from "radix-ui";

import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "group/badge inline-flex rounded-full px-sm transition-colors border-2 border-transparent text-foreground",
  {
    variants: {
      action: {
        primary: "bg-primary",
        muted: "border-muted bg-muted",
        negative: "bg-negative",
        positive: "border-positive bg-positive",
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
        className: "border-muted text-muted",
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
