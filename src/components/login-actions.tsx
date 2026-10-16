import Link from "next/link";
import { RotateCcw, UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";

export function LoginActions() {
  return (
    <div className="flex flex-col gap-3">
      <Button size={"lg"} asChild>
        <Link href="/create">
          <UserPlus />
          Create an account
        </Link>
      </Button>
      <Button size={"lg"} asChild variant="outline" action="muted">
        <Link href="/restore">
          <RotateCcw />
          Restore from seed phrase
        </Link>
      </Button>
    </div>
  );
}
