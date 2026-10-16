"use client";

import { KeyRound } from "lucide-react";
import { useIsClient } from "usehooks-ts";
import { AccountListItem } from "@/components/accounts-list-item";
import { LoginActions } from "@/components/login-actions";
import { useAccountsList } from "@/hooks/accounts";
import { Card } from "@/components/ui/card";
import { FieldSeparator } from "@/components/ui/field";
import { Skeleton } from "@/components/ui/skeleton";
import { H1, P } from "@/components/ui/typography";

export default function LoginPage() {
  // useLocalStorage is not available during SSR: show a placeholder until we are on the client.
  const isClient = useIsClient();
  const accounts = useAccountsList();

  return (
    <div className="flex w-full flex-col gap-8">
      <div className="space-y-2">
        <H1 className="text-3xl">Sign in</H1>
        <P className="text-pretty text-muted-foreground">
          Choose an account saved on this device and unlock it with its passphrase.
        </P>
      </div>

      {!isClient ? (
        <Card className="space-y-0 py-0" aria-busy aria-label="Loading accounts">
          {[0, 1].map((i) => (
            <div key={i} className="flex items-center gap-4 p-4">
              <Skeleton className="size-10 rounded-full" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-4 w-1/3" />
                <Skeleton className="h-3 w-2/3" />
              </div>
            </div>
          ))}
        </Card>
      ) : accounts.length === 0 ? (
        <div className="flex flex-col items-center gap-4 rounded-md border border-dashed p-8 text-center">
          <span
            aria-hidden
            className="flex size-10 items-center justify-center rounded-md bg-muted text-muted-foreground [&_svg]:size-5"
          >
            <KeyRound />
          </span>
          <div className="space-y-1">
            <p className="font-semibold">No accounts on this device</p>
            <P className="text-sm text-pretty text-muted-foreground">
              Create a new account or restore an existing one from your 12-word seed phrase.
            </P>
          </div>
        </div>
      ) : (
        <Card className="space-y-0 divide-y py-0">
          {accounts.map((account) => (
            <AccountListItem key={account.pubkey} account={account} />
          ))}
        </Card>
      )}

      <FieldSeparator>or</FieldSeparator>

      <LoginActions />
    </div>
  );
}
