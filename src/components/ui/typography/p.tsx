import { cn } from "@/lib/utils";

export function P({ className, children, ...props }: React.ComponentProps<"h1">) {
  return (
    <p className={cn("text-base font-medium", className)} {...props}>
      {children}
    </p>
  );
}
