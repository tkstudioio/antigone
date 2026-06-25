"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "react-toastify";
import { Loader2, ChevronsUpDown, Check } from "lucide-react";
import { useDebounceValue } from "usehooks-ts";

import { useCreateStock } from "@/hooks/stocks";
import { useProducts, type Product } from "@/hooks/products";
import { createStockFormSchema } from "@/validators";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Form,
  FormField,
  FormItem,
  FormLabel,
  FormControl,
  FormMessage,
} from "@/components/ui/form";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { ConfirmCreateStockDialog } from "@/components/confirm-create-stock-dialog";
import { cn } from "@/lib/utils";

// Form-side type (input text for price, keysText for raw textarea)
type FormValues = {
  productId: number;
  price: number;
  keysText: string;
};

// Derive codes from keysText
function parseKeysText(text: string): string[] {
  return text
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length > 0);
}

// ─── Create mode props ─────────────────────────────────────────────────────
type CreateModeProps = {
  mode: "create";
  open: boolean;
  onOpenChange: (open: boolean) => void;
  productId?: never;
  productSlug?: never;
  productName?: never;
  price?: never;
};

// ─── Append mode props ─────────────────────────────────────────────────────
type AppendModeProps = {
  mode: "append";
  open: boolean;
  onOpenChange: (open: boolean) => void;
  productId: number;
  productSlug: string;
  productName: string;
  price: number;
};

type Props = CreateModeProps | AppendModeProps;

export function CreateStockSheet(props: Props) {
  const { mode, open, onOpenChange } = props;
  const router = useRouter();

  const [confirmOpen, setConfirmOpen] = useState(false);
  const [pendingPayload, setPendingPayload] = useState<{
    productId: number;
    price: number;
    codes: string[];
    productName: string;
  } | null>(null);

  const [comboOpen, setComboOpen] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [comboSearch, setComboSearch] = useState("");
  const [debouncedSearch] = useDebounceValue(comboSearch, 300);

  const productsQuery = useProducts({ search: debouncedSearch });
  const createStock = useCreateStock();

  const form = useForm<FormValues>({
    resolver: zodResolver(
      createStockFormSchema.extend({
        keysText: z.string().refine((v) => parseKeysText(v).length > 0, {
          message: "Enter at least one key",
        }),
      })
    ),
    defaultValues: {
      productId: mode === "append" ? props.productId : 0,
      // Empty string (not undefined) keeps the price <Input> controlled from
      // mount; the onChange below also normalizes a cleared field to "".
      price: mode === "append" ? props.price : ("" as unknown as number),
      keysText: "",
    },
  });

  // Sync append-mode values into form when props change
  useEffect(() => {
    if (mode === "append") {
      form.setValue("productId", props.productId);
      form.setValue("price", props.price);
    }
  }, [mode, mode === "append" ? props.productId : 0, mode === "append" ? props.price : 0]); // eslint-disable-line react-hooks/exhaustive-deps

  function resetSheet() {
    form.reset({
      productId: mode === "append" ? (props as AppendModeProps).productId : 0,
      price:
        mode === "append" ? (props as AppendModeProps).price : (undefined as unknown as number),
      keysText: "",
    });
    setSelectedProduct(null);
    setComboSearch("");
    setConfirmOpen(false);
  }

  function handleOpenChange(nextOpen: boolean) {
    if (!nextOpen) resetSheet();
    onOpenChange(nextOpen);
  }

  function onSubmit(values: FormValues) {
    const codes = parseKeysText(values.keysText);

    if (mode === "append") {
      // No confirm dialog for append mode — directly mutate
      createStock.mutate(
        { productId: values.productId, price: values.price, codes },
        {
          onSuccess: (result) => {
            toast.success(
              `${result.inserted.toLocaleString("en-US")} key${result.inserted === 1 ? "" : "s"} inserted, ${result.skipped.toLocaleString("en-US")} skipped`
            );
            handleOpenChange(false);
          },
          onError: (err) => {
            const msg = err instanceof Error ? err.message : "Error during the operation";
            toast.error(msg);
          },
        }
      );
      return;
    }

    // Create mode — show confirm dialog
    const productName = selectedProduct?.name ?? "";
    setPendingPayload({ productId: values.productId, price: values.price, codes, productName });
    setConfirmOpen(true);
  }

  async function handleConfirm() {
    if (!pendingPayload) return;
    try {
      const result = await createStock.mutateAsync({
        productId: pendingPayload.productId,
        price: pendingPayload.price,
        codes: pendingPayload.codes,
      });

      if (result.isNew) {
        toast.success(
          `Stock created (${result.inserted.toLocaleString("en-US")} key${result.inserted === 1 ? "" : "s"} inserted)`
        );
        onOpenChange(false);
        router.push(`/stocks/${result.productSlug}`);
      } else {
        toast.success(
          `Keys added to existing stock (${result.inserted.toLocaleString("en-US")} inserted, ${result.skipped.toLocaleString("en-US")} skipped)`
        );
        onOpenChange(false);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Error while creating the stock";
      toast.error(msg);
    }
    setConfirmOpen(false);
  }

  const allProducts = productsQuery.data?.pages.flatMap((p) => p.data) ?? [];

  const sheetTitle =
    mode === "append"
      ? `Add keys · ${props.productName} · ${props.price.toLocaleString("en-US")} sats`
      : "Add Stock";

  return (
    <>
      <Sheet open={open} onOpenChange={handleOpenChange}>
        <SheetContent>
          <SheetHeader>
            <SheetTitle>{sheetTitle}</SheetTitle>
            <SheetDescription>
              {mode === "create"
                ? "Select a product, enter the price and the keys to add."
                : "Add keys to the existing tier (one per line)."}
            </SheetDescription>
          </SheetHeader>

          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="flex flex-col gap-5 p-4">
              {mode === "create" ? (
                <>
                  {/* Product combobox */}
                  <FormField
                    control={form.control}
                    name="productId"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Product</FormLabel>
                        <FormControl>
                          <Popover open={comboOpen} onOpenChange={setComboOpen}>
                            <PopoverTrigger asChild>
                              <Button
                                variant="outline"
                                role="combobox"
                                className={cn(
                                  "w-full justify-between",
                                  !selectedProduct && "text-muted-foreground"
                                )}
                              >
                                {selectedProduct ? selectedProduct.name : "Select product..."}
                                <ChevronsUpDown className="ml-2 size-4 shrink-0 opacity-50" />
                              </Button>
                            </PopoverTrigger>
                            <PopoverContent className="p-0">
                              <Command shouldFilter={false}>
                                <CommandInput
                                  placeholder="Search product..."
                                  value={comboSearch}
                                  onValueChange={setComboSearch}
                                />
                                <CommandList>
                                  {productsQuery.isError ? (
                                    <CommandEmpty>Error loading products</CommandEmpty>
                                  ) : allProducts.length === 0 ? (
                                    <CommandEmpty>No products found.</CommandEmpty>
                                  ) : (
                                    <CommandGroup>
                                      {allProducts.map((p) => (
                                        <CommandItem
                                          key={p.id}
                                          value={String(p.id)}
                                          onSelect={() => {
                                            setSelectedProduct(p);
                                            field.onChange(p.id);
                                            setComboOpen(false);
                                          }}
                                        >
                                          <Check
                                            className={cn(
                                              "mr-2 size-4",
                                              selectedProduct?.id === p.id
                                                ? "opacity-100"
                                                : "opacity-0"
                                            )}
                                          />
                                          {p.name}
                                        </CommandItem>
                                      ))}
                                    </CommandGroup>
                                  )}
                                </CommandList>
                              </Command>
                            </PopoverContent>
                          </Popover>
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  {/* Price input */}
                  <FormField
                    control={form.control}
                    name="price"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Price (sats)</FormLabel>
                        <FormControl>
                          <Input
                            type="number"
                            min={1}
                            step={1}
                            placeholder="e.g. 1500"
                            {...field}
                            onChange={(e) => field.onChange(parseInt(e.target.value, 10) || "")}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </>
              ) : (
                /* Append mode — show readonly info */
                <div className="flex flex-col gap-1 rounded-md border bg-muted/40 p-3 text-sm">
                  <span>
                    <span className="text-muted-foreground">Product: </span>
                    <span className="font-medium">{props.productName}</span>
                  </span>
                  <span>
                    <span className="text-muted-foreground">Price: </span>
                    <span className="font-medium">{props.price.toLocaleString("en-US")} sats</span>
                  </span>
                </div>
              )}

              {/* Keys textarea */}
              <FormField
                control={form.control}
                name="keysText"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Keys (one per line)</FormLabel>
                    <FormControl>
                      <Textarea
                        rows={10}
                        placeholder={"ABCD-1111-AAAA\nABCD-2222-BBBB\nABCD-3333-CCCC"}
                        className="font-mono text-sm"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <Button type="submit" disabled={createStock.isPending}>
                {createStock.isPending ? <Loader2 className="size-4 animate-spin" /> : null}
                Add
              </Button>
            </form>
          </Form>
        </SheetContent>
      </Sheet>

      {/* Confirm dialog (create mode only) */}
      {pendingPayload && (
        <ConfirmCreateStockDialog
          open={confirmOpen}
          onOpenChange={setConfirmOpen}
          codesCount={pendingPayload.codes.length}
          productName={pendingPayload.productName}
          price={pendingPayload.price}
          onConfirm={handleConfirm}
          isPending={createStock.isPending}
        />
      )}
    </>
  );
}
