"use client";

import { useSession } from "next-auth/react";
import { toast } from "react-toastify";
import { CopyIcon } from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";
import { Identicon } from "@/components/identicon";
import { InputGroup, InputGroupButton, InputGroupInput } from "@/components/ui/input-group";

/** Shows the logged-in user's public key (from the NextAuth session) with a copy action. */
export function AccountPubkeyCard() {
  const { data: session } = useSession();
  const pubkey = session?.user.pubkey;

  if (!pubkey) return null;

  async function copyPubkey() {
    try {
      await navigator.clipboard.writeText(pubkey!);
      toast.success("Public key copied");
    } catch {
      toast.error("Failed to copy the public key");
    }
  }

  return (
    <Card className="py-0">
      <CardContent className="flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:p-6">
        <div className="flex min-w-0 flex-1 items-center gap-4">
          <Identicon value={pubkey} size={48} />
          <div className="min-w-0 space-y-0.5">
            <p className="truncate text-base font-semibold">{session.user.username}</p>
            <p className="text-sm text-muted-foreground">
              Your public key: the only thing the server knows about you.
            </p>
          </div>
        </div>
        <InputGroup className="sm:max-w-xs">
          <InputGroupInput
            readOnly
            value={pubkey}
            aria-label="Your public key"
            className="font-mono text-xs"
          />
          <InputGroupButton onClick={copyPubkey} aria-label="Copy public key">
            <CopyIcon />
          </InputGroupButton>
        </InputGroup>
      </CardContent>
    </Card>
  );
}
