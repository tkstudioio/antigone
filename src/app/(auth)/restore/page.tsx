"use client";

import { Controller } from "react-hook-form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { useRestoreAccountForm, useRestoreAccountMutation } from "@/hooks/accounts";
import Link from "next/link";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { P } from "@/components/ui/typography";

export default function RestorePage() {
  const form = useRestoreAccountForm();
  const mutation = useRestoreAccountMutation();
  return (
    <div className="w-full space-y-md">
      <Card>
        <CardHeader>
          <CardTitle>Restore account</CardTitle>
          <CardDescription>
            Enter your 12-word seed phrase to recover an existing account
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form
            className="flex w-full flex-col gap-6"
            onSubmit={form.handleSubmit((values) =>
              mutation.mutate(values, {
                onSuccess: () => form.reset(),
              })
            )}
          >
            <FieldGroup>
              <Controller
                control={form.control}
                name="username"
                render={({ field, fieldState }) => (
                  <Field data-invalid={fieldState.invalid}>
                    <FieldLabel htmlFor="restore-username">Username</FieldLabel>
                    <Input
                      {...field}
                      id="restore-username"
                      aria-invalid={fieldState.invalid}
                      placeholder="Username"
                      autoComplete="off"
                    />
                    {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
                  </Field>
                )}
              />
              <Controller
                control={form.control}
                name="mnemonic"
                render={({ field, fieldState }) => (
                  <Field data-invalid={fieldState.invalid}>
                    <FieldLabel htmlFor="restore-mnemonic">Seed phrase</FieldLabel>
                    <Input
                      {...field}
                      id="restore-mnemonic"
                      aria-invalid={fieldState.invalid}
                      placeholder="The 12 words of your seed phrase"
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
                    <FieldLabel htmlFor="restore-passphrase">Passphrase</FieldLabel>
                    <Input
                      {...field}
                      id="restore-passphrase"
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
                    <FieldLabel htmlFor="restore-confirm-passphrase">
                      Confirm passphrase
                    </FieldLabel>
                    <Input
                      {...field}
                      id="restore-confirm-passphrase"
                      type="password"
                      aria-invalid={fieldState.invalid}
                      placeholder="Repeat the passphrase"
                      autoComplete="off"
                    />
                    {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
                  </Field>
                )}
              />
            </FieldGroup>
            <Button
              type="submit"
              variant="solid"
              className="w-full font-semibold"
              disabled={mutation.isPending}
            >
              {mutation.isPending ? "Restoring..." : "Restore account"}
            </Button>
          </form>
        </CardContent>
      </Card>

      <P className="text-center text-muted-foreground">
        <Link href="/login" className="text-primary underline">
          Back to sign in
        </Link>
      </P>
    </div>
  );
}
