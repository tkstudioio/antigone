---
name: react-hook-form
description: How to build forms using react-hook-form with Zod validation, shadcn/ui Field components, and TanStack React Query mutations. Use this skill whenever the user asks to create a form, add form fields, handle form validation, wire up form submission, or build any UI that collects user input and sends it to the server. This is the primary skill for any form-building task — even simple ones benefit from following this pattern consistently.
---

# Building forms in this project

Every form follows a single architecture: **Zod schema** defines the shape, **react-hook-form** manages state and validation, **shadcn/ui Field components** render the UI, and **TanStack React Query** handles submission. This keeps forms consistent, type-safe, and easy to maintain.

## The pattern at a glance

```
Zod schema ──► z.infer<typeof schema> ──► useForm<T>({ resolver: zodResolver(schema) })
                                              │
                                              ▼
                                     Controller ──► Field + Input (shadcn)
                                              │
                                              ▼
                              form.handleSubmit ──► mutation.mutate(values)
```

## Step-by-step: building a new form

### 1. Define the Zod schema and types

Create a file in `src/hooks/use-<domain>.ts`. Start with the schema:

```ts
import * as z from "zod";

const createProductSchema = z.object({
  name: z.string().min(1, "Name is required"),
  ean: z.string().min(8, "EAN must be at least 8 characters"),
  brand: z.string().min(1, "Brand is required"),
  categoryId: z.string().min(1, "Category is required"),
});

type CreateProductSchema = z.infer<typeof createProductSchema>;
```

The Zod schema is the single source of truth for validation rules and types. The `z.infer` utility extracts the TypeScript type so you never define it twice.

### 2. Create the form hook

In the same file, export a `useXxxForm` hook:

```ts
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";

export function useCreateProductForm() {
  return useForm<CreateProductSchema>({
    defaultValues: {
      name: "",
      ean: "",
      brand: "",
      categoryId: "",
    },
    resolver: zodResolver(createProductSchema),
  });
}
```

Always provide `defaultValues` for every field — this makes the form controlled from the start and avoids the uncontrolled-to-controlled React warning.

### 3. Create the mutation hook

In the same file, export a `useXxxMutation` hook:

```ts
import { useMutation } from "@tanstack/react-query";
import { backend } from "@/lib/backend";

export function useCreateProductMutation() {
  return useMutation({
    mutationKey: ["create-product"],
    mutationFn: async (values: CreateProductSchema) => {
      const { data } = await backend.post("/products", values);
      return data;
    },
  });
}
```

### 4. Build the form component

Create `src/components/<domain>-form.tsx`:

```tsx
"use client";

import { Controller } from "react-hook-form";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { useCreateProductForm, useCreateProductMutation } from "@/hooks/use-product";

export function CreateProductForm() {
  const form = useCreateProductForm();
  const mutation = useCreateProductMutation();

  return (
    <Card>
      <CardHeader>
        <CardTitle>New Product</CardTitle>
      </CardHeader>
      <CardContent>
        <form id="create-product" onSubmit={form.handleSubmit((values) => mutation.mutate(values))}>
          <Controller
            control={form.control}
            name="name"
            render={({ field, fieldState }) => (
              <Field data-invalid={fieldState.invalid}>
                <FieldLabel htmlFor="product-name">Product Name</FieldLabel>
                <Input
                  {...field}
                  id="product-name"
                  aria-invalid={fieldState.invalid}
                  placeholder="Rossetto matte n.42"
                  autoComplete="off"
                />
                {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
              </Field>
            )}
          />

          {/* Repeat Controller for each field */}
        </form>
      </CardContent>
      <CardFooter>
        <Button type="submit" form="create-product" disabled={mutation.isPending}>
          {mutation.isPending ? "Saving..." : "Save"}
        </Button>
      </CardFooter>
    </Card>
  );
}
```

## The Controller pattern

Every form field uses `Controller` from react-hook-form. This is the bridge between react-hook-form's state management and shadcn's uncontrolled-friendly components.

```tsx
<Controller
  control={form.control}
  name="fieldName"
  render={({ field, fieldState }) => (
    <Field data-invalid={fieldState.invalid}>
      <FieldLabel htmlFor="unique-id">Label Text</FieldLabel>
      <Input
        {...field} // spreads value, onChange, onBlur, ref
        id="unique-id"
        aria-invalid={fieldState.invalid} // triggers destructive border styling
        placeholder="..."
      />
      {fieldState.invalid && (
        <FieldError errors={[fieldState.error]} /> // fieldState.error has { message }
      )}
    </Field>
  )}
/>
```

Key points:

- `{...field}` spreads `value`, `onChange`, `onBlur`, and `ref` onto the input
- `data-invalid` on `Field` propagates error styling to all children via CSS
- `aria-invalid` on `Input` triggers the built-in destructive border/ring styles
- `FieldError` accepts `errors` as an array of `{ message?: string }` objects — `[fieldState.error]` wraps the single error in an array

## Multiple fields

For forms with multiple fields, wrap them in `FieldGroup` for consistent spacing:

```tsx
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";

<form id="create-product" onSubmit={form.handleSubmit((v) => mutation.mutate(v))}>
  <FieldGroup>
    <Controller name="name" control={form.control} render={...} />
    <Controller name="ean" control={form.control} render={...} />
    <Controller name="brand" control={form.control} render={...} />
  </FieldGroup>
</form>
```

## Select / dropdown fields

For fields with predefined options, install the select component (`npx shadcn@latest add select`) and use it inside Controller:

```tsx
<Controller
  control={form.control}
  name="categoryId"
  render={({ field, fieldState }) => (
    <Field data-invalid={fieldState.invalid}>
      <FieldLabel htmlFor="category">Category</FieldLabel>
      <Select onValueChange={field.onChange} value={field.value}>
        <SelectTrigger id="category" aria-invalid={fieldState.invalid}>
          <SelectValue placeholder="Select a category" />
        </SelectTrigger>
        <SelectContent>
          {categories.map((cat) => (
            <SelectItem key={cat.id} value={cat.id}>
              {cat.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
    </Field>
  )}
/>
```

Note: for Select, use `onValueChange={field.onChange}` and `value={field.value}` instead of spreading `{...field}`, because radix Select has a different API than native inputs.

## File organization

```
src/
  hooks/
    use-login.ts              — useLoginForm() + useLoginMutation()
    use-product.ts            — useCreateProductForm() + useCreateProductMutation()
    use-price-list-import.ts  — useImportForm() + useImportMutation()
  components/
    login-form.tsx            — LoginForm component
    create-product-form.tsx   — CreateProductForm component
    import-form.tsx           — ImportForm component
```

Each hook file contains both the form hook and the mutation hook for one domain action. The component file imports both and wires them together. This colocation makes it easy to find all the pieces of a form.

## Checklist for a new form

1. Create `src/hooks/use-<domain>.ts`
2. Define Zod schema with validation messages
3. Export `useXxxForm()` with `zodResolver` and `defaultValues`
4. Export `useXxxMutation()` with typed `mutationFn`
5. Create `src/components/<domain>-form.tsx` with `"use client"`
6. Use `Card` layout with form id linking
7. One `Controller` per field, each wrapping `Field` > `FieldLabel` > `Input` > `FieldError`
8. Wire `form.handleSubmit` to `mutation.mutate`
9. Disable submit button with `mutation.isPending`
