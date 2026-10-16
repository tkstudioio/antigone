import { cn } from "@/lib/utils";

export function H1({ className, children, ...props }: React.ComponentProps<"h1">) {
  return (
    <h1 className={cn("font-serif text-4xl leading-tight font-semibold", className)} {...props}>
      {children}
    </h1>
  );
}
