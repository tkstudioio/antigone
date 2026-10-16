"use client";

import { useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { match } from "ts-pattern";
import { toast } from "react-toastify";
import { useDebounceValue } from "usehooks-ts";
import {
  Boxes,
  Check,
  ChevronLeft,
  ChevronRight,
  Loader2,
  LockKeyhole,
  Package,
  Search,
  X,
} from "lucide-react";

import { useCreateStock } from "@/hooks/stocks";
import { useProducts, type Product } from "@/hooks/products";
import { createStockFormSchema } from "@/validators";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Form,
  FormField,
  FormItem,
  FormLabel,
  FormControl,
  FormDescription,
  FormMessage,
} from "@/components/ui/form";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
  InputGroupText,
} from "@/components/ui/input-group";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { toProxySrc } from "@/components/product-image";
import { cn, formatPrice } from "@/lib/utils";

const MAX_KEYS = 1000;

type FormValues = {
  productId: number;
  price: number;
  keysText: string;
};

// Trimmed + deduplicated, the same normalization useCreateStock applies before encrypting.
function parseKeysText(text: string): string[] {
  return [
    ...new Set(
      text
        .split("\n")
        .map((l) => l.trim())
        .filter((l) => l.length > 0)
    ),
  ];
}

const formSchema = createStockFormSchema.extend({
  keysText: z
    .string()
    .refine((v) => parseKeysText(v).length > 0, { message: "Enter at least one key" })
    .refine((v) => parseKeysText(v).length <= MAX_KEYS, {
      message: `Maximum ${MAX_KEYS.toLocaleString("en-US")} keys per upload`,
    }),
});

type StepId = "product" | "price" | "keys" | "review";

const stepLabels: Record<StepId, string> = {
  product: "Product",
  price: "Price",
  keys: "Keys",
  review: "Review",
};

// Fields validated before leaving each step.
const stepFields: Record<StepId, (keyof FormValues)[]> = {
  product: ["productId"],
  price: ["price"],
  keys: ["keysText"],
  review: [],
};

const n = (value: number) => value.toLocaleString("en-US");

// ─── Create mode: full wizard (product → price → keys → review) ────────────
type CreateModeProps = {
  mode: "create";
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

// ─── Append mode: product and price tier are fixed (keys → review) ─────────
type AppendModeProps = {
  mode: "append";
  open: boolean;
  onOpenChange: (open: boolean) => void;
  productId: number;
  productName: string;
  price: number;
};

type Props = CreateModeProps | AppendModeProps;

export function CreateStockDialog(props: Props) {
  const createStock = useCreateStock();

  return (
    <Dialog
      open={props.open}
      // Never close mid-upload: the keys are being encrypted and posted.
      onOpenChange={(next) => !createStock.isPending && props.onOpenChange(next)}
    >
      <DialogContent className="flex max-h-[calc(100dvh-2rem)] max-w-[calc(100%-2rem)] flex-col sm:max-w-2xl">
        {/* Radix unmounts the content on close, so every open starts a fresh wizard. */}
        <StockWizard {...props} createStock={createStock} />
      </DialogContent>
    </Dialog>
  );
}

function StockWizard({
  createStock,
  ...props
}: Props & { createStock: ReturnType<typeof useCreateStock> }) {
  const router = useRouter();
  const steps: StepId[] =
    props.mode === "create" ? ["product", "price", "keys", "review"] : ["keys", "review"];
  const [stepIndex, setStepIndex] = useState(0);
  const step = steps[stepIndex];

  const [search, setSearch] = useState("");
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      productId: props.mode === "append" ? props.productId : 0,
      // Empty string (not undefined) keeps the price <Input> controlled from mount.
      price: props.mode === "append" ? props.price : ("" as unknown as number),
      keysText: "",
    },
  });

  const price = useWatch({ control: form.control, name: "price" });
  const codes = parseKeysText(useWatch({ control: form.control, name: "keysText" }));
  const productName = props.mode === "append" ? props.productName : (selectedProduct?.name ?? "");
  const pending = createStock.isPending;
  const title = props.mode === "create" ? "Add stock" : "Add keys";

  async function goNext() {
    if (await form.trigger(stepFields[step])) setStepIndex((i) => i + 1);
  }

  async function confirm() {
    try {
      const result = await createStock.mutateAsync({
        productId: form.getValues("productId"),
        price: form.getValues("price"),
        codes,
      });
      const counts = `${n(result.inserted)} inserted, ${n(result.skipped)} skipped`;
      props.onOpenChange(false);
      if (result.isNew) {
        toast.success(`Stock created (${counts})`);
        router.push(`/stocks/${result.productSlug}`);
      } else {
        toast.success(`Keys added to the stock (${counts})`);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error while adding the keys");
    }
  }

  const heading = match(step)
    .with("product", () => ({
      title: "Choose a product",
      description: "Search the catalog for the product you want to sell.",
    }))
    .with("price", () => ({
      title: "Set the price",
      description: `How much one key of ${productName} costs, in sats.`,
    }))
    .with("keys", () => ({
      title: "Paste the keys",
      description:
        props.mode === "append"
          ? `New keys for ${productName} at ${formatPrice(price)} sats each, one per line.`
          : "One license key per line.",
    }))
    .with("review", () => ({
      title: "Review your stock",
      description: "Check the details before the keys are encrypted and uploaded.",
    }))
    .exhaustive();

  return (
    <>
      <DialogHeader className="pr-10">
        <span className="font-mono text-xs tracking-widest text-muted-foreground uppercase">
          {title} · Step {stepIndex + 1} of {steps.length}
        </span>
        <DialogTitle className="text-lg">{heading.title}</DialogTitle>
        <DialogDescription>{heading.description}</DialogDescription>
      </DialogHeader>

      <StepIndicator steps={steps} current={stepIndex} disabled={pending} onSelect={setStepIndex} />

      <Form {...form}>
        <form
          noValidate
          className="flex min-h-0 flex-1 flex-col gap-6"
          onSubmit={(e) => {
            e.preventDefault();
            void (step === "review" ? confirm() : goNext());
          }}
        >
          {/* p-1/-m-1 keeps focus rings visible inside the scroll container */}
          <div className="-m-1 min-h-0 flex-1 overflow-y-auto p-1">
            {match(step)
              .with("product", () => (
                <ProductStep
                  search={search}
                  onSearchChange={setSearch}
                  selectedId={selectedProduct?.id ?? null}
                  error={form.formState.errors.productId?.message}
                  onSelect={(product) => {
                    setSelectedProduct(product);
                    form.setValue("productId", product.id, { shouldValidate: true });
                  }}
                />
              ))
              .with("price", () => (
                <FormField
                  control={form.control}
                  name="price"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Price per key</FormLabel>
                      <InputGroup>
                        <FormControl>
                          <InputGroupInput
                            autoFocus
                            type="number"
                            inputMode="numeric"
                            min={1}
                            step={1}
                            placeholder="e.g. 1500"
                            className="tabular-nums"
                            {...field}
                            onChange={(e) => field.onChange(parseInt(e.target.value, 10) || "")}
                          />
                        </FormControl>
                        <InputGroupAddon align="inline-end">
                          <InputGroupText>sats</InputGroupText>
                        </InputGroupAddon>
                      </InputGroup>
                      <FormDescription>
                        Buyers pay the platform fee on top.
                        {selectedProduct?.lowestPrice != null && (
                          <>
                            {" "}
                            The lowest price on the market is{" "}
                            <span className="font-medium text-foreground tabular-nums">
                              {formatPrice(selectedProduct.lowestPrice)} sats
                            </span>
                            .
                          </>
                        )}
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              ))
              .with("keys", () => (
                <div className="space-y-4">
                  <FormField
                    control={form.control}
                    name="keysText"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Keys</FormLabel>
                        <FormControl>
                          <Textarea
                            autoFocus
                            rows={10}
                            placeholder={"ABCD-1111-AAAA\nABCD-2222-BBBB\nABCD-3333-CCCC"}
                            className="max-h-80 font-mono text-sm"
                            spellCheck={false}
                            {...field}
                          />
                        </FormControl>
                        <FormDescription>
                          <span className="font-medium text-foreground tabular-nums">
                            {n(codes.length)} key{codes.length === 1 ? "" : "s"}
                          </span>{" "}
                          detected (max {n(MAX_KEYS)}). Duplicate lines are ignored.
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <EncryptionNote />
                </div>
              ))
              .with("review", () => (
                <ReviewStep
                  productName={productName}
                  imageUrl={selectedProduct?.imageUrl ?? null}
                  price={price}
                  keysCount={codes.length}
                />
              ))
              .exhaustive()}
          </div>

          <DialogFooter className="sm:justify-between">
            {stepIndex > 0 ? (
              <Button
                type="button"
                variant="ghost"
                action="muted"
                disabled={pending}
                onClick={() => setStepIndex((i) => i - 1)}
              >
                <ChevronLeft />
                Back
              </Button>
            ) : (
              <span className="hidden sm:block" aria-hidden />
            )}
            <div className="flex flex-col-reverse gap-2 sm:flex-row">
              <Button
                type="button"
                variant="outline"
                action="muted"
                disabled={pending}
                onClick={() => props.onOpenChange(false)}
              >
                Cancel
              </Button>
              <Button type="submit" className="font-semibold" disabled={pending}>
                {step === "review" ? (
                  <>
                    {pending ? <Loader2 className="animate-spin" /> : <Check />}
                    {pending ? "Encrypting…" : `Confirm and ${title.toLowerCase()}`}
                  </>
                ) : (
                  <>
                    Next
                    <ChevronRight />
                  </>
                )}
              </Button>
            </div>
          </DialogFooter>
        </form>
      </Form>
    </>
  );
}

function StepIndicator({
  steps,
  current,
  disabled,
  onSelect,
}: {
  steps: StepId[];
  current: number;
  disabled: boolean;
  onSelect: (index: number) => void;
}) {
  return (
    <ol aria-label="Progress" className="flex items-center gap-2">
      {steps.map((s, i) => {
        const done = i < current;
        const active = i === current;
        return (
          <li key={s} className="flex flex-1 items-center gap-2 last:flex-none">
            {/* Completed steps are clickable to go back and edit them. */}
            <button
              type="button"
              disabled={!done || disabled}
              onClick={() => onSelect(i)}
              aria-current={active ? "step" : undefined}
              className="flex min-h-8 items-center gap-2 rounded-sm text-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/50 enabled:cursor-pointer enabled:hover:underline"
            >
              <span
                className={cn(
                  "flex size-6 shrink-0 items-center justify-center rounded-full border text-xs font-medium tabular-nums transition-colors",
                  done && "border-primary bg-primary text-primary-foreground",
                  active && "border-primary text-foreground",
                  !done && !active && "text-muted-foreground"
                )}
              >
                {done ? <Check className="size-3.5" aria-hidden /> : i + 1}
              </span>
              <span
                className={cn(active ? "font-medium" : "text-muted-foreground", "max-sm:sr-only")}
              >
                {stepLabels[s]}
              </span>
            </button>
            {i < steps.length - 1 && (
              <span
                aria-hidden
                className={cn("h-px flex-1 transition-colors", done ? "bg-primary" : "bg-border")}
              />
            )}
          </li>
        );
      })}
    </ol>
  );
}

function ProductStep({
  search,
  onSearchChange,
  selectedId,
  onSelect,
  error,
}: {
  search: string;
  onSearchChange: (search: string) => void;
  selectedId: number | null;
  onSelect: (product: Product) => void;
  error?: string;
}) {
  const [debouncedSearch] = useDebounceValue(search, 300);
  const productsQuery = useProducts({ search: debouncedSearch });

  return (
    <div className="space-y-4">
      <InputGroup>
        <InputGroupAddon>
          <Search />
        </InputGroupAddon>
        <InputGroupInput
          autoFocus
          placeholder="Search product"
          aria-label="Search product"
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
        />
        {search.length > 0 && (
          <InputGroupAddon align="inline-end">
            <InputGroupButton aria-label="Clear search" onClick={() => onSearchChange("")}>
              <X />
            </InputGroupButton>
          </InputGroupAddon>
        )}
      </InputGroup>

      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}

      {match(productsQuery)
        .with({ isPending: true }, () => <ProductGridSkeleton />)
        .with({ isError: true }, () => (
          <p className="text-sm text-destructive">Error loading products.</p>
        ))
        .with({ isSuccess: true }, ({ data: { data: products, total } }) => {
          if (products.length === 0) {
            return (
              <div className="flex flex-col items-center gap-2 rounded-md border border-dashed px-6 py-10 text-center">
                <Package className="size-6 text-muted-foreground" aria-hidden />
                <p className="font-medium">No products found</p>
                <p className="text-sm text-muted-foreground">Try a different product name.</p>
              </div>
            );
          }

          return (
            <div className="space-y-3">
              <p className="text-xs text-muted-foreground" aria-live="polite">
                {debouncedSearch
                  ? `${n(total)} result${total === 1 ? "" : "s"}`
                  : "Suggested products"}
                {total > products.length &&
                  ` · showing ${n(products.length)}, refine the search to find others`}
              </p>
              <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                {products.map((product) => (
                  <li key={product.id}>
                    <ProductOption
                      product={product}
                      selected={product.id === selectedId}
                      onSelect={() => onSelect(product)}
                    />
                  </li>
                ))}
              </ul>
            </div>
          );
        })
        .otherwise(() => null)}
    </div>
  );
}

function ProductOption({
  product,
  selected,
  onSelect,
}: {
  product: Product;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onSelect}
      className={cn(
        "flex size-full cursor-pointer flex-col overflow-hidden rounded-md text-left ring-1 ring-border transition-shadow outline-none hover:ring-foreground/30 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
        selected && "ring-2 ring-primary hover:ring-primary"
      )}
    >
      <div className="relative aspect-video w-full bg-muted">
        <ProductThumbnail imageUrl={product.imageUrl} />
        {selected && (
          <span className="absolute top-2 right-2 flex size-6 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-sm">
            <Check className="size-4" aria-hidden />
          </span>
        )}
      </div>
      <div className="space-y-1 p-3">
        <p className="line-clamp-2 leading-snug font-medium">{product.name}</p>
        <p className="text-xs text-muted-foreground tabular-nums">
          {product.lowestPrice != null
            ? `From ${formatPrice(product.lowestPrice)} sats`
            : "No sellers yet"}
        </p>
      </div>
    </button>
  );
}

// Decorative: the product name is always rendered next to it.
function ProductThumbnail({ imageUrl }: { imageUrl: string | null }) {
  return imageUrl ? (
    <Image
      src={toProxySrc(imageUrl)}
      alt=""
      fill
      unoptimized
      sizes="240px"
      className="object-cover"
    />
  ) : (
    <span className="flex size-full items-center justify-center text-muted-foreground">
      <Boxes className="size-6" aria-hidden />
    </span>
  );
}

function ProductGridSkeleton() {
  return (
    <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3" aria-busy aria-label="Loading products">
      {Array.from({ length: 6 }).map((_, index) => (
        <li key={index} className="space-y-2">
          <Skeleton className="aspect-video w-full" />
          <Skeleton className="h-4 w-3/4" />
          <Skeleton className="h-3 w-1/2" />
        </li>
      ))}
    </ul>
  );
}

function ReviewStep({
  productName,
  imageUrl,
  price,
  keysCount,
}: {
  productName: string;
  imageUrl: string | null;
  price: number;
  keysCount: number;
}) {
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-4 rounded-md bg-muted p-4">
        <div className="relative size-12 shrink-0 overflow-hidden rounded-sm bg-background">
          <ProductThumbnail imageUrl={imageUrl} />
        </div>
        <div className="min-w-0">
          <p className="text-xs text-muted-foreground">Product</p>
          <p className="truncate font-semibold">{productName}</p>
        </div>
      </div>

      <dl className="grid gap-3 sm:grid-cols-3">
        <ReviewItem label="Price per key" value={`${formatPrice(price)} sats`} />
        <ReviewItem label="Total keys" value={n(keysCount)} />
        <ReviewItem
          label="Total value"
          value={`${formatPrice(price * keysCount)} sats`}
          emphasized
        />
      </dl>

      <p className="text-xs text-muted-foreground">
        Buyers pay the platform fee on top. Keys you already have for this product are skipped.
      </p>

      <EncryptionNote />
    </div>
  );
}

function ReviewItem({
  label,
  value,
  emphasized,
}: {
  label: string;
  value: string;
  emphasized?: boolean;
}) {
  return (
    <div
      className={cn(
        "space-y-1 rounded-md p-4 ring-1 ring-border",
        emphasized && "bg-primary text-primary-foreground ring-primary"
      )}
    >
      <dt className={cn("text-xs", emphasized ? "opacity-80" : "text-muted-foreground")}>
        {label}
      </dt>
      <dd className="text-lg font-semibold tabular-nums">{value}</dd>
    </div>
  );
}

function EncryptionNote() {
  return (
    <Alert action="muted">
      <LockKeyhole />
      <AlertDescription>
        Keys are encrypted in your browser before upload: the server never sees them.
      </AlertDescription>
    </Alert>
  );
}
