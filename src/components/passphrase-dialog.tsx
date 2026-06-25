"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";

type PassphraseDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  submitLabel?: string;
  pending?: boolean;
  /** Error message (e.g. "Wrong passphrase") shown below the field. */
  error?: string | null;
  onSubmit: (passphrase: string) => void;
  /** If false, the dialog cannot be closed without entering the passphrase (e.g. unlock). */
  dismissable?: boolean;
  /** Optional secondary action (e.g. "Sign out") shown next to submit. */
  secondaryLabel?: string;
  onSecondary?: () => void;
};

/**
 * Internal form: holds the passphrase state. It lives only while the dialog is
 * open (Radix unmounts the content on close), so the passphrase does not stay in
 * memory once closed.
 */
function PassphraseForm({
  title,
  description,
  submitLabel,
  pending,
  error,
  onSubmit,
  secondaryLabel,
  onSecondary,
}: Omit<PassphraseDialogProps, "open" | "onOpenChange" | "dismissable">) {
  const [passphrase, setPassphrase] = useState("");

  return (
    <form
      className="flex flex-col gap-6"
      onSubmit={(e) => {
        e.preventDefault();
        if (passphrase.length === 0 || pending) return;
        onSubmit(passphrase);
      }}
    >
      <DialogHeader>
        <DialogTitle>{title}</DialogTitle>
        {description && <DialogDescription>{description}</DialogDescription>}
      </DialogHeader>

      <Field data-invalid={Boolean(error)}>
        <FieldLabel htmlFor="passphrase-dialog-input">Passphrase</FieldLabel>
        <Input
          id="passphrase-dialog-input"
          type="password"
          value={passphrase}
          onChange={(e) => setPassphrase(e.target.value)}
          aria-invalid={Boolean(error)}
          placeholder="Your passphrase"
          autoComplete="off"
          autoFocus
        />
        {error && <FieldError errors={[{ message: error }]} />}
      </Field>

      <DialogFooter>
        {secondaryLabel && onSecondary && (
          <Button
            type="button"
            variant="ghost"
            className="font-semibold"
            disabled={pending}
            onClick={onSecondary}
          >
            {secondaryLabel}
          </Button>
        )}
        <Button
          type="submit"
          variant="solid"
          className="font-semibold"
          disabled={pending || passphrase.length === 0}
        >
          {pending && <Loader2 className="size-4 animate-spin" />}
          {submitLabel}
        </Button>
      </DialogFooter>
    </form>
  );
}

export function PassphraseDialog({
  open,
  onOpenChange,
  dismissable = true,
  submitLabel = "Confirm",
  pending = false,
  ...formProps
}: PassphraseDialogProps) {
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next && !dismissable) return;
        onOpenChange(next);
      }}
    >
      <DialogContent showCloseButton={dismissable}>
        <PassphraseForm {...formProps} submitLabel={submitLabel} pending={pending} />
      </DialogContent>
    </Dialog>
  );
}
