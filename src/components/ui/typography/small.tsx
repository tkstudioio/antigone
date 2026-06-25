import { cn } from "@/lib/utils";

export function Small({ className, children, ...props }: React.ComponentProps<"h1">) {
  return (
    <p className={cn("text-sm font-medium font-mono text-muted", className)} {...props}>
      {children}
    </p>
  );
}
