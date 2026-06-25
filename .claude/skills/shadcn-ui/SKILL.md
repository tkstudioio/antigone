---
name: shadcn-ui
description: How to use shadcn/ui components in this project. Use this skill whenever you need to build UI with shadcn components — forms, cards, dialogs, inputs, buttons, tables, or any layout. Also use it when adding new shadcn components or when unsure which components are available. This skill is essential any time the user mentions UI components, form fields, inputs, labels, error messages, or layout primitives.
---

# shadcn/ui in this project

This project uses **shadcn v4** with the `radix-vega` style and Tailwind CSS v4. Components live in `src/components/ui/` and are imported via the `@/components/ui/` alias.

## Adding new components

```bash
npx shadcn@latest add <component-name>
```

This generates the component in `src/components/ui/<component-name>.tsx`. Never write shadcn components from scratch — always use the CLI, then customize if needed.

## The Field system

The Field system (`@/components/ui/field`) is how this project builds form layouts. It handles labels, error states, descriptions, and grouping. It requires `"use client"` since it uses React hooks.

### Component hierarchy

```
FieldSet                    — <fieldset> wrapper for related groups
  FieldLegend               — <legend> for the fieldset
  FieldGroup                — flex column container for multiple fields
    Field                   — single field wrapper (label + input + error)
      FieldLabel            — styled <Label> from radix-ui
      <Input /> or other    — the actual input component
      FieldError            — validation error display
      FieldDescription      — helper text below the input
```

### Field

Container for a single form field. Supports `data-invalid` to propagate error styling to all children.

```tsx
<Field data-invalid={fieldState.invalid}>
  <FieldLabel htmlFor="my-input">Email</FieldLabel>
  <Input id="my-input" aria-invalid={fieldState.invalid} />
  {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
</Field>
```

The `orientation` prop controls layout:

- `"vertical"` (default) — label above input
- `"horizontal"` — label and input side by side
- `"responsive"` — vertical on small screens, horizontal on wider ones

### FieldError

Accepts an `errors` prop — an array of objects with a `message` field (matches react-hook-form's error shape). Handles deduplication and renders a single message or a `<ul>` list if there are multiple distinct errors.

```tsx
<FieldError errors={[fieldState.error]} />
```

You can also pass `children` directly instead of `errors`:

```tsx
<FieldError>Custom error message</FieldError>
```

### FieldGroup / FieldSet

Use `FieldGroup` to space multiple `Field` components vertically. Use `FieldSet` + `FieldLegend` for semantically grouped fields (e.g., "Billing Address").

```tsx
<FieldSet>
  <FieldLegend>Shipping Address</FieldLegend>
  <FieldGroup>
    <Field>...</Field>
    <Field>...</Field>
  </FieldGroup>
</FieldSet>
```

## Form layout with Card

Forms typically use a `Card` layout:

```tsx
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

<Card>
  <CardHeader>
    <CardTitle>Form Title</CardTitle>
  </CardHeader>
  <CardContent>
    <form id="my-form" onSubmit={handleSubmit}>
      {/* Field components here */}
    </form>
  </CardContent>
  <CardFooter>
    <Button type="submit" form="my-form">
      Submit
    </Button>
  </CardFooter>
</Card>;
```

The `form` attribute on `Button` links it to the `<form>` by id, so the button can live outside the form element (in the footer) while still triggering submission.

## Input components

### Input

Standard text input. Supports all native `<input>` props. Has built-in `aria-invalid` styling (destructive border + ring).

```tsx
import { Input } from "@/components/ui/input";

<Input
  id="email"
  type="email"
  placeholder="you@example.com"
  aria-invalid={hasError}
  autoComplete="email"
/>;
```

### Textarea

Multi-line text input. Same API pattern as Input.

```tsx
import { Textarea } from "@/components/ui/textarea";

<Textarea id="notes" placeholder="Additional notes..." rows={4} />;
```

## data-slot pattern

shadcn v4 components use `data-slot` attributes for CSS targeting. Each component sets its own slot name (e.g., `data-slot="input"`, `data-slot="field"`, `data-slot="label"`). You rarely need to interact with these directly, but they enable parent-based styling via `has-[>[data-slot=...]]` selectors in Tailwind.

## Available components in this project

Check `src/components/ui/` for installed components. As of now:
badge, button, button-group, card, dialog, field, input, input-group, label, pagination, separator, sheet, sidebar, skeleton, table, textarea, tooltip.

If you need a component not in this list, install it with `npx shadcn@latest add <name>`.
