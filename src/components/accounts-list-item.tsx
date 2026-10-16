"use client";

import { useState } from "react";
import { ChevronRight, Loader2, Trash2 } from "lucide-react";
import { Identicon } from "@/components/identicon";
import { useLoginMutation } from "@/hooks/accounts";
import { useRemoveAccount } from "@/hooks/accounts";
import { StoredAccount } from "@/types/account";
import { Button } from "./ui/button";
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
      <div className="group/account flex items-center gap-2 pr-2 transition-colors hover:bg-muted/50">
        <Button
          type="button"
          onClick={() => setOpen(true)}
          variant={"ghost"}
          action={"muted"}
          aria-label={`Sign in as ${account.username}`}
          className="min-w-0 flex-1 justify-start gap-4 rounded-none p-4 text-left whitespace-normal text-foreground hover:bg-transparent focus-visible:ring-inset"
        >
          <Identicon value={account.pubkey} />
          <div className="min-w-0 flex-1">
            <p className="truncate font-semibold">{account.username}</p>
            <p className="truncate font-mono text-xs text-muted-foreground">
              {account.pubkey.slice(0, 10)}…{account.pubkey.slice(-6)}
              {serverUrl && ` · ${serverUrl.replace(/^https?:\/\//, "")}`}
            </p>
          </div>
          {isPending ? (
            <Loader2 className="size-4 shrink-0 animate-spin text-muted-foreground" aria-hidden />
          ) : (
            <ChevronRight
              className="size-4 shrink-0 text-muted-foreground transition-transform motion-safe:group-hover/account:translate-x-0.5"
              aria-hidden
            />
          )}
        </Button>

        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button
              type="button"
              variant={"ghost"}
              action={"negative"}
              size={"md"}
              className="px-2.5"
              aria-label={`Remove ${account.username} from this device`}
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
