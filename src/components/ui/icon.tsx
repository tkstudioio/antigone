import * as React from "react";
import Image from "next/image";
import { cn } from "@/lib/utils";

function Icon({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div data-slot="logo-item" className={cn("flex items-center", className)} {...props}>
      <Image
        src="/icon.svg"
        alt="Antigone"
        width={128}
        height={128}
        priority
        className={cn("h-7 w-auto aspect-square", className)}
      />
    </div>
  );
}

export { Icon };
