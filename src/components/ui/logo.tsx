import * as React from "react";
import Image from "next/image";
import { cn } from "@/lib/utils";

function Logo({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div data-slot="logo-item" className={cn("flex items-center", className)} {...props}>
      <Image
        src="/logo.svg"
        alt="Antigone"
        width={671}
        height={91}
        priority
        className={cn("h-7 w-auto", className)}
      />
    </div>
  );
}

export { Logo };
