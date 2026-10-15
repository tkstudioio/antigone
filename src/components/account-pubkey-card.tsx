"use client";

import { useSession } from "next-auth/react";
import { toast } from "react-toastify";
import { CopyIcon } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
    <Card>
      <CardHeader className="pb-2">
        <CardTitle>Your public key</CardTitle>
      </CardHeader>
      <CardContent>
        <InputGroup>
          <InputGroupInput readOnly value={pubkey} className="font-mono text-xs" />
          <InputGroupButton onClick={copyPubkey} aria-label="Copy public key">
            <CopyIcon />
          </InputGroupButton>
        </InputGroup>
      </CardContent>
    </Card>
  );
}
