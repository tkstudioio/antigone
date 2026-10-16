"use client";

import { Controller } from "react-hook-form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
  FieldSeparator,
} from "@/components/ui/field";
import { useRestoreAccountForm, useRestoreAccountMutation } from "@/hooks/accounts";
import Link from "next/link";
import { H1, P } from "@/components/ui/typography";

export default function RestorePage() {
  const form = useRestoreAccountForm();
  const mutation = useRestoreAccountMutation();
  return (
    <div className="w-full space-y-8">
      <div className="space-y-2">
        <H1 className="text-3xl">Restore account</H1>
        <P className="text-pretty text-muted-foreground">
          Rebuild your key on this device from your 12-word seed phrase and passphrase.
        </P>
      </div>

      <form
        className="flex w-full flex-col gap-8"
        onSubmit={form.handleSubmit((values) =>
          mutation.mutate(values, {
            onSuccess: () => form.reset(),
          })
        )}
      >
        <FieldGroup className="gap-6">
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
                  placeholder="word1 word2 word3 …"
                  autoComplete="off"
                  autoCapitalize="none"
                  spellCheck={false}
                  className="font-mono"
                />
                {fieldState.invalid ? (
                  <FieldError errors={[fieldState.error]} />
                ) : (
                  <FieldDescription>The 12 words, in order, separated by spaces.</FieldDescription>
                )}
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
                {fieldState.invalid ? (
                  <FieldError errors={[fieldState.error]} />
                ) : (
                  <FieldDescription>
                    The same one you chose at creation: a different passphrase derives a different
                    key.
                  </FieldDescription>
                )}
              </Field>
            )}
          />
          <Controller
            control={form.control}
            name="confirmPassphrase"
            render={({ field, fieldState }) => (
              <Field data-invalid={fieldState.invalid}>
                <FieldLabel htmlFor="restore-confirm-passphrase">Confirm passphrase</FieldLabel>
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
          <FieldSeparator />
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
        </FieldGroup>
        <Button
          type="submit"
          size="lg"
          variant="solid"
          className="w-full font-semibold"
          disabled={mutation.isPending}
        >
          {mutation.isPending ? "Restoring..." : "Restore account"}
        </Button>
      </form>

      <P className="text-center text-sm text-muted-foreground">
        <Link href="/login" className="text-foreground underline underline-offset-4">
          Back to sign in
        </Link>
      </P>
    </div>
  );
}
