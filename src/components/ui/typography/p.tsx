import { cn } from "@/lib/utils";

export function P({ className, children, ...props }: React.ComponentProps<"h1">) {
  return (
    <p className={cn("text-md font-medium", className)} {...props}>
      {children}
    </p>
  );
}
