"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "react-toastify";
import { Loader2 } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";

import { useUpdateStockPrice } from "@/hooks/stocks";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Form,
  FormField,
  FormItem,
  FormLabel,
  FormControl,
  FormDescription,
  FormMessage,
} from "@/components/ui/form";
import { Button } from "@/components/ui/button";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
  InputGroupText,
} from "@/components/ui/input-group";

type FormValues = {
  newPrice: number;
};

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  productId: number;
  oldPrice: number;
};

export function EditStockPriceDialog({ open, onOpenChange, productId, oldPrice }: Props) {
  const queryClient = useQueryClient();
  const updatePrice = useUpdateStockPrice();

  const schema = z.object({
    newPrice: z
      .number({ error: "The price must be a positive integer" })
      .int({ error: "The price must be a positive integer" })
      .positive({ error: "The price must be a positive integer" })
      .refine((v) => v !== oldPrice, {
        message: "The new price must be different from the current one",
      }),
  });

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      newPrice: oldPrice,
    },
  });

  async function onSubmit(values: FormValues) {
    try {
      const result = await updatePrice.mutateAsync({
        productId,
        oldPrice,
        newPrice: values.newPrice,
      });

      if (result.merged) {
        toast.success("Stock merged into the existing price");
      } else {
        toast.success("Price updated");
      }

      onOpenChange(false);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Error during the update";
      if (msg.toLowerCase().includes("not found") || msg.toLowerCase().includes("404")) {
        toast.error("Stock not found");
        void queryClient.invalidateQueries({ queryKey: ["stocks", productId, "tiers"] });
      } else {
        toast.error(msg);
      }
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[calc(100%-2rem)] sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Edit price</DialogTitle>
          <DialogDescription>
            Current price:{" "}
            <strong className="text-foreground tabular-nums">
              {oldPrice.toLocaleString("en-US")} sats
            </strong>{" "}
            per key.
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="flex flex-col gap-6">
            <FormField
              control={form.control}
              name="newPrice"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>New price</FormLabel>
                  <InputGroup>
                    <FormControl>
                      <InputGroupInput
                        type="number"
                        inputMode="numeric"
                        min={1}
                        step={1}
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
                    If you already sell this product at the new price, the two tiers are merged.
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                action="muted"
                onClick={() => onOpenChange(false)}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={updatePrice.isPending}>
                {updatePrice.isPending ? <Loader2 className="size-4 animate-spin" /> : null}
                Save
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
