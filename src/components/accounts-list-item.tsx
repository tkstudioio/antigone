"use client";

import { useState } from "react";
import { Loader2, Trash2 } from "lucide-react";
import { Identicon } from "@/components/identicon";
import { useLoginMutation } from "@/hooks/accounts";
import { useRemoveAccount } from "@/hooks/accounts";
import { StoredAccount } from "@/types/account";
import { Button } from "./ui/button";
import { Large, P } from "./ui/typography";
import { PassphraseDialog } from "@/components/passphrase-dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

const serverUrl = process.env.NEXT_PUBLIC_ARK_OPERATOR_URL ?? "";

export function AccountListItem({ account }: { account: StoredAccount }) {
  const loginMutation = useLoginMutation();
  const removeAccount = useRemoveAccount();
  const [open, setOpen] = useState(false);
  const isPending = loginMutation.isPending;

  return (
    <>
      <div className="flex items-center gap-sm">
        <Button
          type="button"
          onClick={() => setOpen(true)}
          variant={"ghost"}
          action={"muted"}
          className="flex-1 justify-start gap-md py-md! px-0!"
        >
          <Identicon value={account.pubkey} />
          <div className="text-left">
            <Large className="text-foreground">{account.username}</Large>
            <P className="truncate">{serverUrl}</P>
          </div>
          {isPending && <Loader2 className="size-4 animate-spin text-muted-foreground" />}
        </Button>

        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button
              type="button"
              variant={"ghost"}
              action={"negative"}
              size={"md"}
              aria-label={`Remove ${account.username}`}
              disabled={removeAccount.isPending}
            >
              {removeAccount.isPending ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Trash2 className="size-4" />
              )}
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Remove {account.username}?</AlertDialogTitle>
              <AlertDialogDescription>
                The account will be removed from this device. You can restore it from your 12-word
                seed phrase.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                action={"negative"}
                onClick={() => removeAccount.mutate(account.pubkey)}
              >
                Remove
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>

      <PassphraseDialog
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          if (!next) loginMutation.reset();
        }}
        title={`Sign in as ${account.username}`}
        description="Enter the passphrase to unlock the account."
        submitLabel="Sign in"
        pending={isPending}
        error={loginMutation.error instanceof Error ? loginMutation.error.message : null}
        onSubmit={(passphrase) => loginMutation.mutate({ account, passphrase })}
      />
    </>
  );
}
