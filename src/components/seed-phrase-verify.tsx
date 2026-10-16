"use client";

import { Controller } from "react-hook-form";
import { Eye, TriangleAlert } from "lucide-react";

import { useSeedVerifyForm } from "@/hooks/accounts";
import { cn } from "@/lib/utils";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

const MISMATCH = "mismatch";

/**
 * Backup check: the seed phrase grid with every word masked except `positions`, which become
 * inputs. The comparison is local (the mnemonic never leaves the browser).
 */
export function SeedPhraseVerify({
  words,
  positions,
  onVerified,
  onShowWords,
}: {
  words: string[];
  positions: number[];
  onVerified: () => void;
  onShowWords: () => void;
}) {
  const form = useSeedVerifyForm(positions.length);
  const errors = form.formState.errors.words;

  const onSubmit = form.handleSubmit((values) => {
    const wrong = positions.flatMap((position, i) =>
      values.words[i].toLowerCase() === words[position] ? [] : [i]
    );
    if (wrong.length === 0) return onVerified();
    wrong.forEach((i, n) =>
      form.setError(
        `words.${i}`,
        { type: MISMATCH, message: "Does not match" },
        { shouldFocus: n === 0 }
      )
    );
  });

  // One line per invalid input, in grid order, for the summary below the grid.
  const problems = positions.flatMap((position, i) => {
    const error = errors?.[i];
    if (!error) return [];
    return [
      error.type === MISMATCH
        ? `Word #${position + 1} does not match.`
        : `Word #${position + 1} is empty.`,
    ];
  });

  return (
    <form className="flex w-full flex-col gap-8" onSubmit={onSubmit} noValidate>
      <Card className="py-0">
        <CardContent className="p-4">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {words.map((_, position) => {
              const i = positions.indexOf(position);
              if (i === -1) {
                // Masked word: decorative for assistive tech, the inputs carry the meaning.
                return (
                  <div
                    key={position}
                    aria-hidden
                    className="flex items-baseline gap-2 rounded-sm bg-muted px-3 py-2 font-mono text-sm"
                  >
                    <span className="w-5 text-right text-xs text-muted-foreground tabular-nums select-none">
                      {position + 1}
                    </span>
                    <span className="tracking-widest text-muted-foreground/60 select-none">
                      ••••••
                    </span>
                  </div>
                );
              }
              return (
                <Controller
                  key={position}
                  control={form.control}
                  name={`words.${i}`}
                  render={({ field, fieldState }) => (
                    <label
                      className={cn(
                        "flex items-center gap-2 rounded-sm bg-primary/10 py-1 pr-1 pl-3 font-mono text-sm ring-1 ring-primary",
                        fieldState.invalid && "bg-negative/10 ring-negative"
                      )}
                    >
                      <span className="w-5 shrink-0 text-right text-xs font-semibold tabular-nums">
                        {position + 1}
                      </span>
                      <span className="sr-only">Word #{position + 1}</span>
                      <Input
                        {...field}
                        aria-invalid={fieldState.invalid}
                        aria-describedby={fieldState.invalid ? "seed-verify-problems" : undefined}
                        autoComplete="off"
                        autoCapitalize="none"
                        autoCorrect="off"
                        spellCheck={false}
                        enterKeyHint={i === positions.length - 1 ? "done" : "next"}
                        className="min-w-0 bg-background px-2 py-1 font-mono dark:bg-background"
                      />
                    </label>
                  )}
                />
              );
            })}
          </div>
        </CardContent>
      </Card>

      {problems.length > 0 && (
        <Alert action="negative" role="alert" id="seed-verify-problems">
          <TriangleAlert />
          <AlertTitle>Check your written copy</AlertTitle>
          <AlertDescription>
            <ul>
              {problems.map((problem) => (
                <li key={problem}>{problem}</li>
              ))}
            </ul>
          </AlertDescription>
        </Alert>
      )}

      <div className="flex flex-col gap-2">
        <Button
          type="submit"
          size="lg"
          variant="solid"
          className="w-full font-semibold"
          disabled={form.formState.isSubmitting}
        >
          Check words
        </Button>
        <Button
          type="button"
          size="lg"
          variant="ghost"
          action="muted"
          className="w-full"
          onClick={onShowWords}
        >
          <Eye />
          Show the words again
        </Button>
      </div>
    </form>
  );
}
