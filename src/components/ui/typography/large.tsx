import { cn } from "@/lib/utils";

export function Large({ className, children, ...props }: React.ComponentProps<"h1">) {
  return (
    <p className={cn("text-lg font-semibold", className)} {...props}>
      {children}
    </p>
  );
}
