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
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Form,
  FormField,
  FormItem,
  FormLabel,
  FormControl,
  FormMessage,
} from "@/components/ui/form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

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
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit price</DialogTitle>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="flex flex-col gap-4">
            <div className="text-sm text-muted-foreground">
              Current price: <strong>{oldPrice.toLocaleString("en-US")} sats</strong>
            </div>

            <FormField
              control={form.control}
              name="newPrice"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>New price (sats)</FormLabel>
                  <FormControl>
                    <Input
                      type="number"
                      min={1}
                      step={1}
                      {...field}
                      onChange={(e) => field.onChange(parseInt(e.target.value, 10) || "")}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
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
