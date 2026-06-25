import Link from "next/link";
import { Button } from "@/components/ui/button";

export function LoginActions() {
  return (
    <div className="flex flex-col gap-sm">
      <Button size={"lg"} asChild>
        <Link href="/create">Create an account</Link>
      </Button>
      <Button size={"lg"} asChild variant="outline">
        <Link href="/restore">Restore</Link>
      </Button>
    </div>
  );
}
