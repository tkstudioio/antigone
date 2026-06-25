"use client";

import Link from "next/link";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { P } from "@/components/ui/typography";
import { useCreateAccountForm, useCreateAccountMutation } from "@/hooks/accounts";
import { Controller } from "react-hook-form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

export default function CreatePage() {
  const mutation = useCreateAccountMutation();
  const form = useCreateAccountForm();

  // After creation we show the mnemonic only once for backup.
  if (mutation.isSuccess) {
    return (
      <div className="w-full space-y-md">
        <Card>
          <CardHeader>
            <CardTitle>Save your seed phrase</CardTitle>
            <CardDescription>
              Write down these 12 words in a safe place. They will not be shown again.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-md">
            <div className="rounded-md border bg-muted p-md font-mono text-sm break-words">
              {mutation.data.mnemonic}
            </div>
            <Alert action="negative">
              <AlertTitle>Warning</AlertTitle>
              <AlertDescription>
                To recover the account you need <strong>both</strong> the seed phrase{" "}
                <strong>and</strong> the passphrase. If you lose either one, the account and funds
                are unrecoverable: there is no recovery.
              </AlertDescription>
            </Alert>
            <Button variant="solid" className="w-full font-semibold" asChild>
              <Link href="/login">I saved the seed phrase, sign in</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="w-full space-y-md">
      <Card>
        <CardHeader>
          <CardTitle>Create a new account</CardTitle>
          <CardDescription>Choose a username and a passphrase for your account</CardDescription>
        </CardHeader>
        <CardContent>
          <form
            className="flex w-full flex-col gap-6"
            onSubmit={form.handleSubmit((values) => mutation.mutate(values))}
          >
            <Controller
              control={form.control}
              name="username"
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel htmlFor="create-account-username">Username</FieldLabel>
                  <Input
                    {...field}
                    id="create-account-username"
                    aria-invalid={fieldState.invalid}
                    placeholder="Your username"
                    autoComplete="off"
                  />
                  {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
                </Field>
              )}
            />
            <Controller
              control={form.control}
              name="passphrase"
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel htmlFor="create-account-passphrase">Passphrase</FieldLabel>
                  <Input
                    {...field}
                    id="create-account-passphrase"
                    type="password"
                    aria-invalid={fieldState.invalid}
                    placeholder="Your passphrase"
                    autoComplete="off"
                  />
                  {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
                </Field>
              )}
            />
            <Controller
              control={form.control}
              name="confirmPassphrase"
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel htmlFor="create-account-confirm-passphrase">
                    Confirm passphrase
                  </FieldLabel>
                  <Input
                    {...field}
                    id="create-account-confirm-passphrase"
                    type="password"
                    aria-invalid={fieldState.invalid}
                    placeholder="Repeat the passphrase"
                    autoComplete="off"
                  />
                  {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
                </Field>
              )}
            />
            <Button
              type="submit"
              variant="solid"
              className="w-full font-semibold"
              disabled={mutation.isPending}
            >
              {mutation.isPending ? "Creating..." : "Create account"}
            </Button>
          </form>
        </CardContent>
      </Card>

      <P className="text-center text-muted-foreground">
        Already have an account?{" "}
        <Link href="/login" className="text-primary underline">
          Sign in
        </Link>
      </P>
    </div>
  );
}
