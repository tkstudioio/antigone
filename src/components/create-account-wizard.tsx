"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Controller } from "react-hook-form";
import { ShieldCheck, TriangleAlert } from "lucide-react";

import {
  useCreateAccountMutation,
  useCreatePassphraseForm,
  useCreateUsernameForm,
} from "@/hooks/accounts";
import { cn, generateMnemonic } from "@/lib/utils";

import { SeedPhraseVerify } from "@/components/seed-phrase-verify";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { H1, P } from "@/components/ui/typography";

type Step = "username" | "backup" | "verify" | "passphrase";

const STEP_LABELS = ["Username", "Back up", "Verify", "Passphrase"] as const;

/** Number of seed words the user re-types to prove the backup. */
const VERIFY_WORD_COUNT = 3;

/**
 * Account creation wizard: username → seed phrase backup → optional backup check → passphrase.
 * The mnemonic is generated here and only lives in memory; the account is registered and stored
 * (encrypted vault) at the last step, since the key is derived from mnemonic + passphrase.
 */
export function CreateAccountWizard() {
  const [step, setStep] = useState<Step>("username");
  const [username, setUsername] = useState("");
  const [mnemonic, setMnemonic] = useState("");
  const [positions, setPositions] = useState<number[]>([]);
  const [verified, setVerified] = useState(false);

  const words = mnemonic.split(" ");

  switch (step) {
    case "username":
      return (
        <UsernameStep
          onSubmit={(value) => {
            setUsername(value);
            setMnemonic(generateMnemonic());
            setStep("backup");
          }}
        />
      );
    case "backup":
      return (
        <BackupStep
          words={words}
          onVerify={() => {
            // Fresh random positions on every attempt, so a retry is not a lookup of the last one.
            setPositions(pickPositions(words.length, VERIFY_WORD_COUNT));
            setStep("verify");
          }}
          onSkip={() => setStep("passphrase")}
        />
      );
    case "verify":
      return (
        <div className="w-full space-y-8">
          <StepHeader
            current={3}
            title="Verify your backup"
            description="Type the highlighted words from your written copy. Case does not matter."
            focusOnMount
          />
          <SeedPhraseVerify
            words={words}
            positions={positions}
            onVerified={() => {
              setVerified(true);
              setStep("passphrase");
            }}
            onShowWords={() => setStep("backup")}
          />
        </div>
      );
    case "passphrase":
      return <PassphraseStep username={username} mnemonic={mnemonic} verified={verified} />;
  }
}

function UsernameStep({ onSubmit }: { onSubmit: (username: string) => void }) {
  const form = useCreateUsernameForm();

  return (
    <div className="w-full space-y-8">
      <StepHeader
        current={1}
        title="Create your key"
        description="Pick a username. Your key is generated right here, in this browser."
      />

      <form
        className="flex w-full flex-col gap-8"
        onSubmit={form.handleSubmit((values) => onSubmit(values.username))}
      >
        <FieldGroup className="gap-6">
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
                {fieldState.invalid ? (
                  <FieldError errors={[fieldState.error]} />
                ) : (
                  <FieldDescription>
                    At least 6 characters. Others see it on your listings.
                  </FieldDescription>
                )}
              </Field>
            )}
          />
        </FieldGroup>

        <Button type="submit" size="lg" variant="solid" className="w-full font-semibold">
          Continue
        </Button>
      </form>

      <P className="text-center text-sm text-muted-foreground">
        Already have an account?{" "}
        <Link href="/login" className="text-foreground underline underline-offset-4">
          Sign in
        </Link>
      </P>
    </div>
  );
}

function BackupStep({
  words,
  onVerify,
  onSkip,
}: {
  words: string[];
  onVerify: () => void;
  onSkip: () => void;
}) {
  return (
    <div className="w-full space-y-8">
      <StepHeader
        current={2}
        title="Save your seed phrase"
        description="Write these 12 words down, in order, on paper. Keep them offline: no screenshots, no cloud notes."
        focusOnMount
      />

      <Card className="py-0">
        <CardContent className="p-4">
          <ol className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {words.map((word, i) => (
              <li
                key={i}
                className="flex items-baseline gap-2 rounded-sm bg-muted px-3 py-2 font-mono text-sm"
              >
                <span className="w-5 text-right text-xs text-muted-foreground tabular-nums select-none">
                  {i + 1}
                </span>
                <span className="font-medium">{word}</span>
              </li>
            ))}
          </ol>
        </CardContent>
      </Card>

      <Alert action="negative">
        <TriangleAlert />
        <AlertTitle>There is no recovery</AlertTitle>
        <AlertDescription>
          To restore the account you will need <strong>both</strong> these words{" "}
          <strong>and</strong> the passphrase you set next. Lose either one and the account and its
          funds are gone for good.
        </AlertDescription>
      </Alert>

      <section aria-labelledby="backup-check-title" className="space-y-4 border-t pt-6">
        <div className="space-y-1">
          <h2 id="backup-check-title" className="font-semibold">
            Check your copy now?
          </h2>
          <P className="text-sm text-pretty text-muted-foreground">
            We will ask for {VERIFY_WORD_COUNT} of the words. It takes a few seconds and catches a
            typo before it costs you the account.
          </P>
        </div>
        <div className="flex flex-col gap-2">
          <Button size="lg" variant="solid" className="w-full font-semibold" onClick={onVerify}>
            Verify my backup
          </Button>
          <Button size="lg" variant="ghost" action="muted" className="w-full" onClick={onSkip}>
            Skip verification
          </Button>
          <P className="text-center text-xs text-muted-foreground">
            These words will not be shown again once you set the passphrase.
          </P>
        </div>
      </section>
    </div>
  );
}

function PassphraseStep({
  username,
  mnemonic,
  verified,
}: {
  username: string;
  mnemonic: string;
  verified: boolean;
}) {
  const form = useCreatePassphraseForm();
  const mutation = useCreateAccountMutation();

  return (
    <div className="w-full space-y-8">
      <StepHeader
        current={4}
        title="Set your passphrase"
        description="It works as the 13th word of your seed phrase and unlocks your key on this device."
        focusOnMount
      />

      {verified && (
        <Alert action="positive">
          <ShieldCheck />
          <AlertTitle>Your backup is valid</AlertTitle>
          <AlertDescription>The words you typed match your seed phrase.</AlertDescription>
        </Alert>
      )}

      <form
        className="flex w-full flex-col gap-8"
        onSubmit={form.handleSubmit(({ passphrase }) =>
          mutation.mutate({ username, mnemonic, passphrase })
        )}
      >
        <FieldGroup className="gap-6">
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
                  autoComplete="new-password"
                />
                {fieldState.invalid ? (
                  <FieldError errors={[fieldState.error]} />
                ) : (
                  <FieldDescription>
                    It cannot be reset. Store it apart from the seed phrase.
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
                <FieldLabel htmlFor="create-account-confirm-passphrase">
                  Confirm passphrase
                </FieldLabel>
                <Input
                  {...field}
                  id="create-account-confirm-passphrase"
                  type="password"
                  aria-invalid={fieldState.invalid}
                  placeholder="Repeat the passphrase"
                  autoComplete="new-password"
                />
                {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
              </Field>
            )}
          />
        </FieldGroup>

        {mutation.isError && (
          <Alert action="negative" role="alert">
            <TriangleAlert />
            <AlertTitle>Account not created</AlertTitle>
            <AlertDescription>
              {mutation.error instanceof Error
                ? mutation.error.message
                : "Something went wrong. Try again."}
            </AlertDescription>
          </Alert>
        )}

        <Button
          type="submit"
          size="lg"
          variant="solid"
          className="w-full font-semibold"
          disabled={mutation.isPending || mutation.isSuccess}
        >
          {mutation.isPending ? "Creating…" : "Create account"}
        </Button>
      </form>
    </div>
  );
}

/**
 * Step title block. `focusOnMount` moves focus to the heading when a step replaces the
 * previous one, so keyboard and screen reader users land on the new content.
 */
function StepHeader({
  current,
  title,
  description,
  focusOnMount = false,
}: {
  current: number;
  title: string;
  description: string;
  focusOnMount?: boolean;
}) {
  const headingRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    if (focusOnMount) headingRef.current?.focus();
  }, [focusOnMount]);

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <span className="font-mono text-xs tracking-widest text-muted-foreground uppercase">
          Step {current} of {STEP_LABELS.length} · {STEP_LABELS[current - 1]}
        </span>
        <div aria-hidden className="grid grid-cols-4 gap-1.5">
          {STEP_LABELS.map((label, i) => (
            <span
              key={label}
              className={cn(
                "h-1 rounded-full transition-colors motion-reduce:transition-none",
                i < current ? "bg-primary" : "bg-muted"
              )}
            />
          ))}
        </div>
      </div>
      <div className="space-y-2">
        <H1 ref={headingRef} tabIndex={-1} className="text-3xl outline-none">
          {title}
        </H1>
        <P className="text-pretty text-muted-foreground">{description}</P>
      </div>
    </div>
  );
}

/** `count` distinct, ascending indexes in `[0, total)`, drawn with the Web Crypto RNG. */
function pickPositions(total: number, count: number): number[] {
  const pool = Array.from({ length: total }, (_, i) => i);
  const random = crypto.getRandomValues(new Uint32Array(count));
  // Partial Fisher–Yates: the first `count` slots become the sample.
  for (let i = 0; i < count; i++) {
    const j = i + (random[i] % (total - i));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool.slice(0, count).sort((a, b) => a - b);
}
