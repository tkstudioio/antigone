"use client";

import { Loader2, X } from "lucide-react";
import { useIsClient } from "usehooks-ts";
import { AccountListItem } from "@/components/accounts-list-item";
import { LoginActions } from "@/components/login-actions";
import { useAccountsList } from "@/hooks/accounts";
import { Separator } from "@/components/ui/separator";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import Link from "next/link";

export default function LoginPage() {
  // useLocalStorage is not available during SSR: show the spinner until we are on the client.
  const isClient = useIsClient();
  const accounts = useAccountsList();

  return (
    <div className="w-full space-y-md">
      <Button className="fixed top-md right-md" action={"negative"} asChild size={"sm"}>
        <Link href={"/"}>
          <X />
        </Link>
      </Button>
      {!isClient ? (
        <div className="flex justify-center py-lg">
          <Loader2 className="size-6 animate-spin text-muted-foreground" />
        </div>
      ) : accounts.length === 0 ? (
        <Card variant="ghost" className="text-center">
          <CardHeader>
            <CardTitle>No accounts</CardTitle>
            <CardDescription>
              Create a new account or restore an existing one from your 12-word seed phrase.
            </CardDescription>
          </CardHeader>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>Sign in</CardTitle>
            <CardDescription>Choose an account to sign in</CardDescription>
          </CardHeader>
          <CardContent className="space-y-sm">
            {accounts.map((account) => (
              <AccountListItem key={account.pubkey} account={account} />
            ))}
          </CardContent>
        </Card>
      )}

      <div className="flex items-center gap-sm">
        <Separator className="flex-1" />
        <span className="text-xs text-muted-foreground">or</span>
        <Separator className="flex-1" />
      </div>

      <LoginActions />
    </div>
  );
}
